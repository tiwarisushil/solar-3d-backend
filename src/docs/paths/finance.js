// OpenAPI paths for /api/billing, /api/stock, /api/suppliers, and /api/expenses.
// Success JSON is the value itself (no { data } wrapper). Amounts are numbers in the company currency.
// Response timestamps are ISO 8601. Query from/to are YYYY-MM-DD. Body dates are parsed with Date — send ISO 8601.

const oid = { $ref: '#/components/schemas/ObjectId' };
const R = (name) => ({ $ref: `#/components/responses/${name}` });
const auth = { 401: R('Unauthorized'), 403: R('Forbidden'), 429: R('RateLimited'), 500: R('ServerError') };
const V = { 400: R('ValidationError') };
const N = { 404: R('NotFound') };
const C = { 409: R('Conflict') };

const money = { type: 'number', description: 'Company-currency amount. The server rounds money it computes to 2 decimal places.' };
const iso = { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp.' };
const isoNull = { type: 'string', format: 'date-time', nullable: true };
const str = (description, example) => ({ type: 'string', description, ...(example !== undefined ? { example } : {}) });

function q(name, schema, description) {
  return { name, in: 'query', required: false, schema, description };
}
function pathId(name, description) {
  return { name, in: 'path', required: true, description, schema: oid };
}
function done(code, description, schema, example, more = {}) {
  return {
    ...more,
    [String(code)]: { description, content: { 'application/json': { schema, example } } },
    ...auth,
  };
}
function op(operationId, tag, summary, description, parameters, requestBody, responses) {
  const out = { tags: [tag], operationId, summary, description, security: [{ bearerAuth: [] }], responses };
  if (parameters?.length) out.parameters = parameters;
  if (requestBody) out.requestBody = requestBody;
  return out;
}
function jsonBody(description, schema, example) {
  return { required: true, description, content: { 'application/json': { schema, example } } };
}
function fileBody(description) {
  return {
    required: true,
    description,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['file'],
          properties: { file: { type: 'string', format: 'binary', description: 'Form field name is `file` (one file).' } },
        },
      },
    },
  };
}

const pageLimit = [
  q('page', { type: 'integer', minimum: 1, default: 1 }, '1-based page. Missing, blank, or not a number is 1.'),
  q('limit', { type: 'integer', minimum: 1, maximum: 200, default: 50 }, 'Page size. Missing or not a number is 50. Below 1 becomes 1. Above 200 is clamped to 200.'),
];
const fromTo = (field) => [
  q('from', { type: 'string', example: '2026-11-01' }, `Inclusive start, \`YYYY-MM-DD\` (UTC midnight), applied to \`${field}\`. Any other shape is ignored, not rejected.`),
  q('to', { type: 'string', example: '2026-11-23' }, `Inclusive end, \`YYYY-MM-DD\` (through 23:59:59.999 UTC), applied to \`${field}\`. Any other shape is ignored.`),
];
const partyQ = [
  q('design', oid, 'Proposal id. When present, `client` is ignored. The proposal must be Booked (`won`).'),
  q('client', oid, 'Client id. Used only when `design` is omitted: a sale with no proposal.'),
];

const FIN = 'Mount: some Finances access, else 403 `You don\'t have access to Finances. Ask your company admin.` A branch owner (`branch`) or company admin (`company`) passes the staff permission named below. Staff (`agent`) need that permission.';
const perm = (area, action, label) => `Staff need \`${area}:${action}\` or 403 \`You need the \u201c${label}\u201d permission. Ask your company admin.\``;
const OWNER = 'Owner only: role `branch` or `company`. Staff get 403 `You do not have access to this area` even when they can view finances. Voiding and deleting a receipt take money off the books, so they are not a staff permission.';
const STOCK_MOUNT = 'Mount: some Inventory, Finances, or Installations access, else 403 `You don\'t have access to Inventory or Finances or Installations. Ask your company admin.`';
const EXP_MOUNT = 'Mount: some Expenses access, else 403 `You don\'t have access to Expenses. Ask your company admin.`';
const PARTY = 'One of `design` or `client` is required. Neither: 400 `Choose the client or the booked proposal`. Unknown id: 404 `Proposal not found` or `Client not found`. Proposal not Booked: 400 `The proposal must be Booked first`. Proposal with no client: 400 `This proposal has no client`. A bad 24-hex id is 404 with that same noun, not 400.';
const IDEM = 'Optional `idempotencyKey` (schema allows up to 64 characters). It dedupes only when it is 8\u201364 of letters, digits, `_`, or `-`. A repeat returns the first document and does not take stock or record money again; HTTP status is still 201. A shorter key or other characters are ignored, not an error.';
const MONEY = 'Goods rates are exclusive of GST (`pricing.gstIncluded` is false); tax is added. `line.gross` is quantity \u00d7 rate before discount. `line.amount` is after that line\u2019s share of the discount. `pricing.subtotal` sums `amount` (after discount, before tax). `line.taxable` equals `amount`. `line.gstAmount` is the tax and `line.lineTotal` is taxable + tax. `pricing.gstTotal` sums the tax. `pricing.total` sums `lineTotal` and is copied to the document `total`. `pricing.discount` is the number you sent (rupees, or a percent when `discountIsPercent` is true, max 100). `pricing.discountAmount` is the rupees removed, never more than the pre-tax amount. `pricing.sgst` and `pricing.cgst` are each half of `gstTotal`; `pricing.igst` equals `gstTotal`. All three are stored. This API does not take a place of supply.';
const LEDGER = '`total` is the proposal grand total (`summary.pricing.total`, else `summary.cost`). `paid` sums every payment row on the proposal (money taken when a bill was generated, older-invoice payments, and receipts). `balance` is `total` \u2212 `paid`. `billed` sums open bills plus older invoices whose status is not `void` (cancelled and superseded bills add nothing). `due` is `billed` \u2212 `paid`. Negative `due` means an advance: receipts are ahead of what has been billed.';
const PDF_ONCE = 'Multipart field `file`, one PDF, 20 MB. Wrong declared type: 400 `Upload a PDF`. Content that is not a real PDF: 400 `That file is not a valid PNG, JPG, WebP image or PDF`. Over 20 MB: 400 `That file is too large`. No file: 400 `Upload a PDF`. The stored file is never replaced: a second upload is 409 `This {document} already has its PDF archived. Issued documents can\'t be replaced.` and the new file is discarded. Uploads are also limited to 60 per user per 10 minutes, and 3 at once (429 `Too many uploads at once. Wait for the others to finish.`, `code` `RATE_LIMITED`). The response is `{ ok: true, pdfName }` \u2014 the stored file name, not the PDF bytes and not the whole record. `pdfName` is what later reads show on the document.';
const DATES = 'Timestamps in JSON are ISO 8601. Query `from` / `to` must be `YYYY-MM-DD` or they are ignored.';

const payModes = ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'];
const priceTypes = ['base', 'wholesale', 'retail'];
const ewayStatus = ['open', 'billed', 'cancelled', 'superseded'];
const billStatus = ['paid', 'invoiced', 'void'];
const transportModes = ['road', 'rail', 'air', 'ship'];
const transportReasons = ['supply', 'job_work', 'own_use', 'exhibition', 'others'];
const unitStatus = ['inStock', 'sold', 'installed', 'returned'];

const pricingSchema = {
  type: 'object',
  description: MONEY,
  properties: {
    lines: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Frozen priced lines. Goods lines include productId, batch, batchNo, serials, priceType, qty, rate, hsn, unit, name, detail, kind `goods`. Service lines have kind `service` and no productId.' },
    subtotal: money,
    discount: money,
    discountIsPercent: { type: 'boolean' },
    discountAmount: money,
    discountRemark: { type: 'string' },
    taxableTotal: money,
    gstTotal: money,
    gstIncluded: { type: 'boolean', description: 'False on bills created here: the rate does not already include GST.' },
    gstRate: { type: 'number', description: 'Highest GST percent on the lines.' },
    taxByHsn: { type: 'array', items: { type: 'object', properties: { hsn: { type: 'string' }, taxable: money, gst: money, rate: { type: 'number', nullable: true } } } },
    total: money,
    sgst: money,
    cgst: money,
    igst: money,
    withGst: { type: 'boolean' },
    invoiceGstMode: { type: 'string', enum: ['with_gst', 'without_gst'] },
  },
};

const transportSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: transportModes, description: 'Default `road` when omitted.' },
    reason: { type: 'string', enum: transportReasons, description: 'Default `supply` when omitted.' },
    vehicleNo: str('Uppercased, letters, digits, and hyphen only. Max 20.'),
    transporter: str('Max 120.'),
    transporterId: str('Transporter GSTIN or enrolment id. Uppercased. Max 15.'),
    docNo: str('LR / RR / airway bill number. Max 80.'),
    docDate: str('Printed as typed, max 20. Not parsed. Use `YYYY-MM-DD`.'),
    fromPlace: str('Dispatch from. Max 200.'),
    toPlace: str('Deliver to. Max 200.'),
    distanceKm: { type: 'number', nullable: true, minimum: 0, maximum: 100000, description: 'Kilometres. Null when omitted. Negative is 400 `Distance must be 0 or more`.' },
  },
};

const serviceLineSchema = {
  type: 'object',
  required: ['rate'],
  properties: {
    chargeId: { description: 'Installation-charge id, or blank. When it matches a charge, name and SAC default from it. The price, GST, and quantity are what you send.', anyOf: [oid, { type: 'string', maxLength: 0 }] },
    name: str('Max 160. Required in effect: 400 `Give every service a name` when charge and name are both empty.'),
    description: str('Max 300. Stored as the line detail.'),
    hsn: str('SAC code. Digits only, max 8. Defaults from the charge. Empty prints as a dash.'),
    qty: { type: 'number', minimum: 0, maximum: 1000000, description: 'Defaults to 1. Must be > 0 or 400 `Enter the quantity of {name}`.' },
    unit: str('Max 20. Default `Nos`.'),
    rate: { ...money, minimum: 0, maximum: 1e10, description: 'Price per unit, exclusive of GST. Required. Negative or missing: 400 `Enter the price of {name}`.' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Default: the charge\u2019s GST, else 18. Outside 0\u2013100: 400 `GST % of {name} must be between 0 and 100`.' },
  },
};

const goodsLineSchema = {
  type: 'object',
  required: ['productId', 'priceType'],
  properties: {
    productId: oid,
    priceType: { type: 'string', enum: priceTypes, description: 'Which batch price is the rate: `base`, `wholesale`, or `retail`. Missing: 400 `Choose the base, wholesale or retail price for {product}`.' },
    qty: { type: 'number', minimum: 0, maximum: 1e7, description: 'Required for a product that is not serialized. Serialized products: omit, or it must equal the number of serials.' },
    batch: { description: 'Batch id. Blank or omitted: oldest batches with stock first (FIFO).', anyOf: [oid, { type: 'string', maxLength: 0 }] },
    serials: { type: 'array', maxItems: 2000, items: { type: 'string', maxLength: 80 }, description: 'Required when the product is serialized. Duplicates in one request: 400 `Serial number {sn} is listed twice`.' },
    detail: str('Printed under the line. Max 600. Serials are also stored on `serials`.'),
  },
};

const ewaySchema = {
  type: 'object',
  description: 'A bill (Mongo model EwayBill). Numbered `BILL-0001`. This is the document the billing screen creates. `itemCount` is the sum of line quantities. `lineCount` is `lines.length`.',
  properties: {
    id: oid,
    company: oid,
    design: { description: 'Proposal id, or `{ id, name }` on list/get, or null for a client-only sale.', nullable: true },
    client: { description: 'Client id, or a populated client (`name`, and on get also `phone`, `email`, `address`, `gstNumber`).' },
    ewayNo: str('Company bill number, `BILL-0001`. Not the GST portal number.', 'BILL-0001'),
    govtEwayNo: str('12 digits from the GST portal, or empty.'),
    issuedOn: iso,
    title: str('Proposal name, or the client name.'),
    lines: { type: 'array', items: { type: 'object', additionalProperties: true } },
    services: { type: 'array', items: serviceLineSchema },
    pricing: pricingSchema,
    total: money,
    transport: transportSchema,
    withChallan: { type: 'boolean', description: 'True when the bill has materials and a delivery challan was requested.' },
    paid: {
      type: 'object',
      nullable: true,
      description: 'What was collected when the bill was generated. `amount` is the bill total less any advance already held. `settled` is true.',
      properties: { settled: { type: 'boolean' }, amount: money, mode: { type: 'string', enum: payModes }, reference: { type: 'string' } },
    },
    note: { type: 'string' },
    status: { type: 'string', enum: ewayStatus, description: '`open` can be cancelled or revised. `billed` is on an older invoice. `cancelled` put stock back. `superseded` was revised; use the replacement.' },
    bill: { description: 'Older invoice (Bill) this was pulled onto, `{ id, billNo }` when populated, or null.', nullable: true },
    cancelledAt: isoNull,
    cancelReason: { type: 'string' },
    supersededBy: { nullable: true },
    supersedes: { nullable: true },
    supersededAt: isoNull,
    supersededByNo: { type: 'string', nullable: true },
    supersedesNo: { type: 'string', nullable: true },
    pdfName: str('Archived PDF file name, or empty. Not a URL.'),
    createdByName: { type: 'string' },
    itemCount: { type: 'number' },
    lineCount: { type: 'integer' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const pageOf = (item) => ({
  type: 'object',
  required: ['items', 'total', 'page', 'limit'],
  properties: {
    items: { type: 'array', items: item },
    total: { type: 'integer', description: 'Rows matching the filter, before this page is sliced.' },
    page: { type: 'integer' },
    limit: { type: 'integer', description: 'Page size actually used.' },
  },
});

const legacyBillSchema = {
  type: 'object',
  description: 'An older tax invoice (Mongo model Bill). Numbered with the company invoice sequence (`billNo`). New sales do not create these. Status `paid` (not yet on an Invoice row), `invoiced`, or `void`.',
  properties: {
    id: oid,
    company: oid,
    design: { nullable: true },
    client: { description: 'Id, or `{ id, name }` on the list. Get also includes phone, email, address, gstNumber.' },
    billNo: str('Tax invoice number.', 'INV-0007'),
    issuedOn: iso,
    title: { type: 'string' },
    ewayBills: { type: 'array', description: 'On the list: `{ id, ewayNo }`. On get: also govtEwayNo, issuedOn, total, transport. On uninvoiced: ewayNo, issuedOn, total.' },
    services: { type: 'array', items: { type: 'object', additionalProperties: true } },
    pricing: { nullable: true },
    total: money,
    paid: { type: 'object', properties: { amount: money, mode: { type: 'string', enum: payModes }, reference: { type: 'string' }, receivedOn: iso, note: { type: 'string' } } },
    payment: { description: 'Payment row id, or null after void.', nullable: true },
    creditedTotal: money,
    status: { type: 'string', enum: billStatus },
    invoice: { description: 'Older Invoice row `{ id, invoiceNo }` when populated, or null.', nullable: true },
    pdfName: { type: 'string' },
    billToCompany: { type: 'string' },
    details: { nullable: true },
    termsAndConditions: { type: 'string' },
    voidedAt: isoNull,
    voidReason: { type: 'string' },
    voidedByName: { type: 'string' },
    createdByName: { type: 'string' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const invoiceSchema = {
  type: 'object',
  description: 'An Invoice row. `kind` `sale` or `amc_parts`. `status` `issued` or `void`. Older rows may omit status (treat as issued) or kind (treat as sale). AMC parts invoices are created from an AMC visit, not from these routes.',
  properties: {
    id: oid,
    company: oid,
    design: { nullable: true },
    client: { description: 'Id, or `{ id, name }` on the list.', nullable: true },
    billTo: { nullable: true, type: 'object', properties: { name: { type: 'string' }, company: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' }, gstNumber: { type: 'string' } } },
    billToCompany: { type: 'string' },
    details: { nullable: true },
    invoiceNo: str('Company invoice number.', 'INV-0007'),
    issuedOn: iso,
    title: { type: 'string' },
    total: money,
    pricing: { nullable: true },
    termsAndConditions: { type: 'string' },
    pdfName: { type: 'string' },
    status: { type: 'string', enum: ['issued', 'void'] },
    kind: { type: 'string', enum: ['sale', 'amc_parts'] },
    voidedAt: isoNull,
    voidReason: { type: 'string' },
    voidedByName: { type: 'string' },
    createdByName: { type: 'string' },
    bills: { type: 'array', items: oid },
    billRefs: { type: 'array', items: { type: 'object', properties: { bill: oid, billNo: { type: 'string' }, issuedOn: isoNull, total: money, ewayNos: { type: 'array', items: { type: 'string' } } } } },
    createdAt: iso,
    updatedAt: iso,
  },
};

const receiptSchema = {
  type: 'object',
  description: 'A receipt: a payment row with no `bill` and no `ewayBill`, numbered `RCPT-0001`. `contractTotal` is what was billed to the party when this was saved. `balanceAfter` is `contractTotal` minus every payment on the party including this one. Negative `balanceAfter` is an advance.',
  properties: {
    id: oid,
    company: oid,
    design: { description: 'Proposal id, or `{ id, name }` on the list, or null.', nullable: true },
    client: { description: 'Client id, or on the list `{ id, name, phone, email, address, gstNumber }`.' },
    ewayBill: { nullable: true, description: 'Always null on this list.' },
    bill: { nullable: true, description: 'Always null on this list.' },
    billTo: { type: 'object', nullable: true, properties: { name: { type: 'string' } } },
    title: { type: 'string' },
    receiptNo: str('`RCPT-0001`. Older rows may still show `RCT-\u2026`.', 'RCPT-0004'),
    amount: money,
    refunded: { type: 'number', description: 'Usually 0 on a receipt.' },
    mode: { type: 'string', enum: payModes },
    reference: { type: 'string' },
    receivedOn: iso,
    note: { type: 'string' },
    reason: { type: 'string', description: 'What the money is for. Printed on the receipt. Optional.' },
    receivedByName: { type: 'string' },
    contractTotal: money,
    balanceAfter: money,
    pdfName: { type: 'string' },
    createdByName: { type: 'string' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const creditNoteSchema = {
  type: 'object',
  description: 'A credit note, numbered `CN-0001`. Creating one is disabled; existing rows can be read and their PDF archived.',
  properties: {
    id: oid,
    company: oid,
    design: { nullable: true },
    client: {},
    bill: { description: 'Older invoice this return was against. List/get populate `{ id, billNo }` (get also `issuedOn`).' },
    invoice: { nullable: true },
    creditNo: str('', 'CN-0001'),
    issuedOn: iso,
    title: { type: 'string' },
    reason: { type: 'string' },
    lines: { type: 'array', items: { type: 'object', additionalProperties: true } },
    pricing: { nullable: true },
    total: money,
    refund: { type: 'object', properties: { amount: money, mode: { type: 'string', enum: payModes }, reference: { type: 'string' }, refundedOn: iso, note: { type: 'string' } } },
    pdfName: { type: 'string' },
    createdByName: { type: 'string' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const overviewRow = {
  type: 'object',
  properties: {
    id: { ...oid, description: 'Proposal id.' },
    name: { type: 'string' },
    type: str('Proposal grid type, such as `on_grid`.'),
    client: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } } },
    total: { ...money, description: 'Proposal grand total.' },
    paid: { ...money, description: 'Sum of payment rows on the proposal.' },
    balance: { ...money, description: '`total` \u2212 `paid`.' },
    billed: { ...money, description: 'Open bills + non-void older invoices.' },
    due: { ...money, description: '`billed` \u2212 `paid`. Negative is an advance.' },
    billNo: str('Newest open bill number (`ewayNo`), or empty.'),
    payments: { type: 'integer', description: 'Count of payment rows, not rupees.' },
    invoiceNo: str('Newest non-void older invoice number (`billNo`) or legacy Invoice number, or empty.'),
    lastPaidOn: isoNull,
    bookedOn: { ...iso, description: 'Proposal `updatedAt`, not a separate booked-on field.' },
  },
};

const ledgerSchema = {
  type: 'object',
  description: `One party\u2019s billing screen. ${LEDGER} \`receipts\` are receipt rows only. \`invoices\` are Invoice rows. \`invoice\` is the latest non-void sale invoice, or null. \`ewayBills\` and \`bills\` are the full lists (not paged), newest first. \`openEwayBills\` counts status \`open\`. \`uninvoicedBills\` counts older invoices with status \`paid\`. \`creditNotes\` are newest first.`,
  properties: {
    design: { type: 'object', description: 'Present on the proposal ledger. `id`, `name`, `status`, `type`, `pricing` (saved proposal pricing or null), `quote`, `client` (the client record).' },
    client: { type: 'object', description: 'Present on the client ledger (no proposal): `id`, `name`, `phone`, `email`, `address`, `gstNumber`.' },
    total: money,
    paid: money,
    balance: money,
    billed: money,
    due: money,
    receipts: { type: 'array', items: receiptSchema },
    invoices: { type: 'array', items: invoiceSchema },
    invoice: { nullable: true },
    ewayBills: { type: 'array', items: ewaySchema },
    bills: { type: 'array', items: legacyBillSchema },
    openEwayBills: { type: 'integer' },
    uninvoicedBills: { type: 'integer' },
    creditNotes: { type: 'array', items: creditNoteSchema },
    previousTermsAndConditions: { type: 'string' },
    previousBillToCompany: { type: 'string' },
    nextInvoiceNo: str('The number the next tax invoice would get. Nothing is reserved.', 'INV-0008'),
  },
};

const pdfOk = {
  type: 'object',
  required: ['ok', 'pdfName'],
  properties: { ok: { type: 'boolean', enum: [true] }, pdfName: str('Stored file name. The record\u2019s `pdfName` is this value.', '665f1c2a3b4d5e6f7a8b9c0d-ewaybill-665f1c2a3b4d5e6f7a8b9c0e-ab12cd34.pdf') },
};

const okSchema = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } };

const batchSchema = {
  type: 'object',
  description: 'One stock receipt. `qtyReceived` is what came in. `qtyRemaining` is still in stock. Selling and issuing decrement `qtyRemaining` only. Prices are per unit in the company currency.',
  properties: {
    id: oid,
    company: oid,
    product: { description: 'Product id, unless a reader populated it.', anyOf: [oid, { type: 'object' }] },
    supplier: { description: 'Supplier id on create/update. List populates `{ id, name }`.' },
    batchNo: { type: 'string' },
    mfgDate: isoNull,
    mfgYear: { type: 'integer', nullable: true, description: 'Calendar year when only the year is known. 1990 through the server\u2019s next calendar year.' },
    receivedDate: iso,
    qtyReceived: { type: 'number' },
    qtyRemaining: { type: 'number' },
    purchasePrice: money,
    basePrice: money,
    wholesalePrice: money,
    retailPrice: money,
    note: { type: 'string' },
    billUrl: str('`/uploads/{filename}` of the supplier bill, or empty. The file is not in this JSON.'),
    billName: str('Original file name, max 200, or empty.'),
    createdAt: iso,
    updatedAt: iso,
  },
};

const unitSchema = {
  type: 'object',
  description: 'One physical item of a serialized product. `warrantyEnd` is `installDate` plus the product warranty in months (UTC, clamped to the month\u2019s last day), or null when not installed or when the product was not loaded.',
  properties: {
    id: oid,
    company: oid,
    product: { description: 'Product id, or on serial lookup `{ id, name, brand, model, warrantyMonths }`.' },
    batch: { description: 'Batch id, or on a list `{ id, batchNo, receivedDate }`.' },
    serialNo: { type: 'string', maxLength: 80 },
    status: { type: 'string', enum: unitStatus },
    soldInvoice: { description: 'Invoice id, or on lookup `{ id, invoiceNo, issuedOn }`, or null.', nullable: true },
    soldEwayBill: { description: 'Bill id the unit left stock on, or on lookup `{ id, ewayNo, issuedOn }`, or null.', nullable: true },
    installedProject: { description: 'Installation id, or on a list `{ id, design: { id, name } }`, or null.', nullable: true },
    installDate: isoNull,
    warrantyEnd: isoNull,
    createdAt: iso,
    updatedAt: iso,
  },
};

const supplierSchema = {
  type: 'object',
  properties: {
    id: oid,
    company: oid,
    name: str('Stored with the first letter capitalised.', 'Acme Solar'),
    phone: str('Indian mobile as 10 digits, or `+` and country code. Empty allowed.'),
    email: { type: 'string' },
    gstNumber: str('GSTIN or another country\u2019s tax number, uppercased. Empty allowed.'),
    address: { type: 'string' },
    notes: { type: 'string' },
    categories: { type: 'array', items: oid, description: 'Product-category ids this supplier sells. Optional.' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const expenseSchema = {
  type: 'object',
  description: 'Money spent delivering one proposal. It does not change billing or stock. `amount` is the company-currency cost of this entry.',
  properties: {
    id: oid,
    company: oid,
    design: oid,
    amount: money,
    reason: { type: 'string', maxLength: 300 },
    note: { type: 'string', maxLength: 500 },
    billUrl: str('`/uploads/{filename}`, or empty.'),
    billName: { type: 'string' },
    billSize: { type: 'integer', description: 'Bytes of the attached bill. 0 when none.' },
    spentOn: iso,
    createdBy: { nullable: true },
    createdByName: { type: 'string' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const projectMoney = {
  type: 'object',
  properties: {
    id: { ...oid, description: 'Proposal id.' },
    name: { type: 'string' },
    status: str('Proposal status. Booked is `won`.'),
    address: { type: 'string' },
    client: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' } } },
    spent: { ...money, description: 'Sum of expense amounts on this proposal.' },
    count: { type: 'integer', description: 'Number of expense rows.' },
    lastExpenseOn: { ...isoNull, description: 'Latest `spentOn`, or null.' },
    budget: { ...money, nullable: true, description: 'A budget someone set, else the Booked proposal price when that price is > 0, else null.' },
    budgetSource: { type: 'string', nullable: true, enum: ['set', 'proposal'], description: '`set` if a budget row exists. `proposal` if the Booked price is used. Null when there is no budget.' },
    budgetUsed: { type: 'number', nullable: true, description: '`spent / budget \u00d7 100`, one decimal. Null when budget is missing or 0.' },
    profit: { ...money, nullable: true, description: '`budget \u2212 spent`. Positive is money left (profit). Negative is over budget (loss). Null when there is no budget.' },
  },
};

const budgetSchema = {
  type: 'object',
  properties: {
    amount: money,
    note: { type: 'string' },
    updatedByName: { type: 'string' },
    updatedAt: isoNull,
    source: { type: 'string', enum: ['set', 'proposal'], description: '`set` after PUT. `proposal` when the Booked price is standing in and nobody has saved a budget.' },
  },
};

const ewayExample = {
  id: '665f1c2a3b4d5e6f7a8b9c0d',
  company: '665f1c2a3b4d5e6f7a8b9c01',
  design: '665f1c2a3b4d5e6f7a8b9c02',
  client: '665f1c2a3b4d5e6f7a8b9c03',
  ewayNo: 'BILL-0004',
  govtEwayNo: '',
  issuedOn: '2026-11-23T07:30:00.000Z',
  title: '12 kW rooftop \u2014 Sharma',
  lines: [{ kind: 'goods', name: '550 W panel', productId: '665f1c2a3b4d5e6f7a8b9c04', batch: '665f1c2a3b4d5e6f7a8b9c05', batchNo: 'LOT-12', serials: [], priceType: 'retail', qty: 2, unit: 'Nos', rate: 10000, hsn: '85414300', gross: 20000, amount: 20000, taxable: 20000, gstPercent: 12, gstAmount: 2400, lineTotal: 22400 }],
  services: [],
  pricing: { subtotal: 20000, discount: 0, discountIsPercent: false, discountAmount: 0, taxableTotal: 20000, gstTotal: 2400, total: 22400, sgst: 1200, cgst: 1200, igst: 2400, gstIncluded: false, withGst: true, invoiceGstMode: 'with_gst' },
  total: 22400,
  transport: { mode: 'road', reason: 'supply', vehicleNo: '', transporter: '', transporterId: '', docNo: '', docDate: '', fromPlace: '', toPlace: '', distanceKm: null },
  withChallan: true,
  paid: { settled: true, amount: 22400, mode: 'upi', reference: 'UPI123' },
  note: '',
  status: 'open',
  bill: null,
  pdfName: '',
  createdByName: 'Anita',
  itemCount: 2,
  lineCount: 1,
  supersededByNo: null,
  supersedesNo: null,
  createdAt: '2026-11-23T07:30:00.000Z',
  updatedAt: '2026-11-23T07:30:00.000Z',
};

const receiptExample = {
  id: '665f1c2a3b4d5e6f7a8b9c10',
  company: '665f1c2a3b4d5e6f7a8b9c01',
  design: '665f1c2a3b4d5e6f7a8b9c02',
  client: '665f1c2a3b4d5e6f7a8b9c03',
  bill: null,
  ewayBill: null,
  billTo: { name: 'Sharma' },
  title: '12 kW rooftop \u2014 Sharma',
  receiptNo: 'RCPT-0004',
  amount: 5000,
  refunded: 0,
  mode: 'upi',
  reference: 'UPI9988',
  receivedOn: '2026-11-23T08:00:00.000Z',
  note: '',
  reason: 'Advance before material',
  receivedByName: 'Anita',
  contractTotal: 0,
  balanceAfter: -5000,
  pdfName: '',
  createdByName: 'Anita',
  createdAt: '2026-11-23T08:00:00.000Z',
  updatedAt: '2026-11-23T08:00:00.000Z',
};

const batchExample = {
  id: '665f1c2a3b4d5e6f7a8b9c05',
  company: '665f1c2a3b4d5e6f7a8b9c01',
  product: '665f1c2a3b4d5e6f7a8b9c04',
  supplier: '665f1c2a3b4d5e6f7a8b9c06',
  batchNo: 'LOT-12',
  mfgDate: null,
  mfgYear: 2026,
  receivedDate: '2026-11-20T00:00:00.000Z',
  qtyReceived: 10,
  qtyRemaining: 10,
  purchasePrice: 8000,
  basePrice: 9000,
  wholesalePrice: 9500,
  retailPrice: 10000,
  note: '',
  billUrl: '',
  billName: '',
  createdAt: '2026-11-20T04:00:00.000Z',
  updatedAt: '2026-11-20T04:00:00.000Z',
};

const expenseExample = {
  id: '665f1c2a3b4d5e6f7a8b9c20',
  company: '665f1c2a3b4d5e6f7a8b9c01',
  design: '665f1c2a3b4d5e6f7a8b9c02',
  amount: 2500,
  reason: 'Labour charges',
  note: 'Site wiring',
  billUrl: '',
  billName: '',
  billSize: 0,
  spentOn: '2026-11-22T00:00:00.000Z',
  createdBy: '665f1c2a3b4d5e6f7a8b9c11',
  createdByName: 'Anita',
  createdAt: '2026-11-23T09:00:00.000Z',
  updatedAt: '2026-11-23T09:00:00.000Z',
};

const billing = {
  '/api/billing/overview': {
    get: op(
      'billingOverview',
      'Billing',
      'List booked proposals with what is billed and paid',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nEvery Booked proposal (\`status\` \`won\`), newest update first. Not paged. ${LEDGER} \`payments\` is a count. \`billNo\` is the newest open bill\u2019s \`ewayNo\` (empty if none). \`invoiceNo\` is the newest non-void older invoice number (empty if none). \`bookedOn\` is the proposal \`updatedAt\`. \`from\` / \`to\` filter the proposal\u2019s \`createdAt\`, not the bill date. ${DATES} There is no single-invoice GET; open a row with \`GET /api/billing/designs/{id}\`.`,
      [...fromTo('the proposal createdAt')],
      null,
      done(200, 'Array of booked proposals. Not wrapped.', { type: 'array', items: overviewRow }, [{
        id: '665f1c2a3b4d5e6f7a8b9c02', name: '12 kW rooftop \u2014 Sharma', type: 'on_grid',
        client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma', phone: '9876543210', email: 'sharma@example.com' },
        total: 250000, paid: 27400, balance: 222600, billed: 22400, due: -5000, billNo: 'BILL-0004', payments: 2, invoiceNo: '', lastPaidOn: '2026-11-23T08:00:00.000Z', bookedOn: '2026-11-18T06:00:00.000Z',
      }]),
    ),
  },
  '/api/billing/invoices': {
    get: op(
      'billingListInvoices',
      'Billing',
      'List tax-invoice rows',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nInvoice rows (not the bills you create, and not the older Bill invoices). Newest first. \`from\` / \`to\` filter \`issuedOn\`. ${DATES} Page shape is \`{ items, total, page, limit }\`. Default limit 50, max 200. Includes \`sale\` and \`amc_parts\`, including void. \`client\` on each row is \`{ id, name }\` or missing.`,
      [...pageLimit, ...fromTo('issuedOn')],
      null,
      done(200, 'One page of Invoice rows.', pageOf(invoiceSchema), {
        items: [{ id: '665f1c2a3b4d5e6f7a8b9c30', invoiceNo: 'INV-0003', status: 'issued', kind: 'sale', total: 22400, issuedOn: '2026-11-01T00:00:00.000Z', title: '12 kW rooftop \u2014 Sharma', design: '665f1c2a3b4d5e6f7a8b9c02', client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma' }, pdfName: '', createdAt: '2026-11-01T04:00:00.000Z' }],
        total: 1, page: 1, limit: 50,
      }),
    ),
  },
  '/api/billing/invoices/next-number': {
    get: op(
      'billingNextInvoiceNumber',
      'Billing',
      'Peek the next tax-invoice number',
      `${FIN} ${perm('finances', 'create_invoice', 'Finances \u203a Create AMC parts invoice')}\n\nReturns the number the next Invoice or older Bill invoice would get (company prefix plus the next sequence). Nothing is reserved; two callers can see the same value until one of them issues.`,
      null,
      null,
      done(200, 'The next number only.', { type: 'object', required: ['nextInvoiceNo'], properties: { nextInvoiceNo: { type: 'string', example: 'INV-0008' } } }, { nextInvoiceNo: 'INV-0008' }),
    ),
  },
  '/api/billing/designs/{id}': {
    get: op(
      'billingGetDesign',
      'Billing',
      'Proposal billing ledger',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nThe billing page for one proposal: bills, receipts, older invoices, credit notes, and the running totals. ${LEDGER} On this proposal ledger \`total\` is the quote, so \`balance\` (\`total\` \u2212 \`paid\`) and \`due\` (\`billed\` \u2212 \`paid\`) differ when the quote and the bills differ. \`previousTermsAndConditions\` and \`previousBillToCompany\` come from the latest non-void older invoice, else the latest legacy Invoice. Unknown or non-hex id: 404 \`Proposal not found\`.`,
      [pathId('id', 'Proposal id.')],
      null,
      done(200, 'Proposal ledger.', ledgerSchema, {
        design: { id: '665f1c2a3b4d5e6f7a8b9c02', name: '12 kW rooftop \u2014 Sharma', status: 'won', type: 'on_grid', pricing: { total: 250000 }, quote: null, client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma' } },
        total: 250000, paid: 27400, balance: 222600, billed: 22400, due: -5000,
        receipts: [receiptExample], invoices: [], invoice: null, ewayBills: [ewayExample], bills: [], openEwayBills: 1, uninvoicedBills: 0, creditNotes: [],
        previousTermsAndConditions: '', previousBillToCompany: '', nextInvoiceNo: 'INV-0008',
      }, N),
    ),
  },
  '/api/billing/clients/{id}': {
    get: op(
      'billingGetClient',
      'Billing',
      'Client billing ledger with no proposal',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nSame screen as the proposal ledger, for documents whose \`design\` is null. There is no quote: \`total\` and \`billed\` are both the billed total, and \`balance\` equals \`due\` (\`billed\` \u2212 \`paid\`). ${LEDGER} Unknown id: 404 \`Client not found\`. A non-hex id is the same 404.`,
      [pathId('id', 'Client id.')],
      null,
      done(200, 'Client ledger. No `design` key.', ledgerSchema, {
        client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma', phone: '9876543210', email: 'sharma@example.com', address: '', gstNumber: '' },
        total: 22400, paid: 22400, balance: 0, billed: 22400, due: 0,
        receipts: [], invoices: [], invoice: null, ewayBills: [], bills: [], openEwayBills: 0, uninvoicedBills: 0, creditNotes: [],
        previousTermsAndConditions: '', previousBillToCompany: '', nextInvoiceNo: 'INV-0008',
      }, N),
    ),
  },
  '/api/billing/eway-bills': {
    get: op(
      'billingListEwayBills',
      'Billing',
      'List bills',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nEvery bill (e-way document), newest first. \`{ items, total, page, limit }\`. Default limit 50, max 200. \`from\` / \`to\` filter \`issuedOn\` (\`YYYY-MM-DD\`). \`status\` optional: \`open\`, \`billed\`, \`cancelled\`, \`superseded\`. Any other status matches nothing (empty page, not 400). Each item is the bill plus \`itemCount\`, \`lineCount\`, and populated \`client\` \`{ id, name }\`, \`design\` \`{ id, name }\` or null, \`bill\` \`{ id, billNo }\` or null.`,
      [...pageLimit, ...fromTo('issuedOn'), q('status', { type: 'string', enum: ewayStatus }, 'Optional. Unknown values return an empty page.')],
      null,
      done(200, 'One page of bills.', pageOf(ewaySchema), { items: [ewayExample], total: 1, page: 1, limit: 50 }),
    ),
    post: op(
      'billingCreateEwayBill',
      'Billing',
      'Create a bill (stock out, and collect what is still due)',
      `${FIN} ${perm('finances', 'create_eway_bill', 'Finances \u203a Create bill')}\n\n${PARTY} Send \`design\` or \`client\` in the JSON body (not the query string).\n\nCreates the bill the billing screen shows (stored as an e-way document, number \`BILL-0001\`). ${MONEY} \`withGst\` is accepted and ignored: GST is always added.\n\nStock: each goods line leaves stock in the same transaction. The product must be active, else 400 \`\u201c{name}\u201d is inactive and can\u2019t be sold or billed\`. Serialized: send \`serials\` (400 \`Choose the serial numbers of {name}\`; if \`qty\` is sent it must match). Not serialized: send \`qty\` (400 \`Enter the quantity of {name}\`). Blank \`batch\` uses oldest stock first. Not enough stock: 409 \`Not in stock: {serials}\`, \`Only {n} {unit} of {name} in stock\`, or \`Batch {no} of {name} has only {n} {unit} left\`. Race: 409 \`Some of these units were just sold. Refresh and try again\`.\n\nServices do not move stock. At least one goods line or one service, else 400 \`Add at least one product from stock or at least one service\`. A service with no name: 400 \`Give every service a name\`. Bad qty/price/GST: \`Enter the quantity of {name}\`, \`Enter the price of {name}\`, \`GST % of {name} must be between 0 and 100\`. More than 50 services: validation \`Up to 50 services on a bill\`.\n\nChallan: \`withChallan\` defaults to on when there is at least one product. \`false\`, or a service-only bill, stores transport defaults (\`road\` / \`supply\`, empty text) and ignores \`transport\`. When the challan is on, omitted mode/reason become \`road\` / \`supply\`. \`vehicleNo\` is uppercased and stripped to letters, digits, and hyphen.\n\n\`govtEwayNo\`: digits only. Empty is fine. Any other length: 400 \`The e-way bill number from the GST portal has 12 digits\`. \`issuedOn\` is ISO; omitted means now; unparseable: 400 \`Invalid date\`. Percent discount over 100: 400 \`A percentage discount can be at most 100%\`. Computed total not above zero: 400 \`Invoice total must be greater than zero\`.\n\nPayment: the server sets \`paid.amount\` to min(this \`total\`, max(0, due before this bill + this \`total\`)). Due before is open bills + non-void older invoices \u2212 every payment on the party. That collects this bill minus any advance already on receipts. When \`paid.amount\` is at least 0.01 a payment row numbered \`PMT-\` plus the bill number is inserted (mode defaults to \`cash\`). It counts in ledger \`paid\` and \`due\`. It does not appear in \`GET /api/billing/receipts\`. The response is the bill, not that payment row. \`paid.settled\` is true even when the amount is 0.\n\n${IDEM} \`design\` and \`client\` on the created bill are ids, not populated objects. Status is \`open\`.`,
      null,
      jsonBody('Party plus lines and/or services. Extra keys are ignored.', {
        type: 'object',
        properties: {
          design: { description: 'Booked proposal id, or blank. Wins over `client`.', anyOf: [oid, { type: 'string', maxLength: 0 }] },
          client: { description: 'Client id when there is no proposal, or blank.', anyOf: [oid, { type: 'string', maxLength: 0 }] },
          idempotencyKey: str('8\u201364 of letters, digits, `_`, `-`. Anything else is ignored.'),
          lines: { type: 'array', maxItems: 100, items: goodsLineSchema, description: 'Products to take from stock. Up to 100.' },
          services: { type: 'array', maxItems: 50, items: serviceLineSchema },
          withGst: { type: 'boolean', description: 'Ignored. GST is always on.' },
          discount: { type: 'number', minimum: 0, maximum: 1e10, description: 'Rupees, or a percent when `discountIsPercent` is true (then at most 100).' },
          discountIsPercent: { type: 'boolean', description: 'Omitted means a rupee discount.' },
          discountRemark: str('Max 200.'),
          govtEwayNo: str('GST portal e-way number. 12 digits if sent. Non-digits are stripped.'),
          payment: {
            type: 'object',
            description: 'How this collection was received. Omitted mode is `cash`. The amount is computed; do not send one.',
            properties: {
              mode: { type: 'string', enum: payModes },
              reference: str('UPI / cheque / bank reference. Max 80.'),
            },
          },
          issuedOn: str('ISO 8601. Omitted: now.'),
          note: str('Max 300.'),
          withChallan: { type: 'boolean', description: 'Omitted means true when the bill has products.' },
          transport: transportSchema,
        },
      }, {
        design: '665f1c2a3b4d5e6f7a8b9c02',
        lines: [{ productId: '665f1c2a3b4d5e6f7a8b9c04', priceType: 'retail', qty: 2 }],
        services: [{ name: 'Installation', qty: 1, rate: 5000, gstPercent: 18, unit: 'Nos' }],
        discount: 0,
        payment: { mode: 'upi', reference: 'UPI123' },
        issuedOn: '2026-11-23T07:30:00.000Z',
        withChallan: true,
        transport: { mode: 'road', reason: 'supply', vehicleNo: 'MH12AB1234', fromPlace: 'Pune', toPlace: 'Nashik', distanceKm: 210 },
        idempotencyKey: 'bill-sharma-20261123',
      }),
      done(201, 'The new bill. Status `open`. A repeat with the same idempotency key is also 201 and the same bill.', ewaySchema, ewayExample, { ...V, ...N, ...C }),
    ),
  },
  '/api/billing/eway-bills/open': {
    get: op(
      'billingListOpenEwayBills',
      'Billing',
      'List a party\u2019s open bills',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\n${PARTY}\n\nOpen bills only, oldest first. Not paged: the body is an array. Used when an older invoice was built from open bills. New sales do not create that invoice from this API.`,
      partyQ,
      null,
      done(200, 'Array of open bills. Empty array when the party has none.', { type: 'array', items: ewaySchema }, [], {
        ...N,
        400: { description: 'No party, or the proposal is not Booked.', content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } }, example: { error: 'Choose the client or the booked proposal' } } } },
      }),
    ),
  },
  '/api/billing/eway-bills/{id}': {
    get: op(
      'billingGetEwayBill',
      'Billing',
      'Get one bill',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nFull bill. \`client\` includes name, phone, email, address, gstNumber. \`design\` is \`{ id, name }\` or null. \`bill\` is \`{ id, billNo }\` or null. Missing row: 404 \`Bill not found\`. A non-hex id is 404 \`E-way bill not found\` (the id check uses a different noun than a missing row).`,
      [pathId('id', 'Bill id (e-way document).')],
      null,
      done(200, 'The bill.', ewaySchema, ewayExample, N),
    ),
  },
  '/api/billing/eway-bills/{id}/cancel': {
    post: op(
      'billingCancelEwayBill',
      'Billing',
      'Cancel an open bill and put stock back',
      `${FIN} ${perm('finances', 'create_eway_bill', 'Finances \u203a Create bill')}\n\nCancels a bill that is still \`open\` and not on an older invoice. Side effects, one transaction: goods go back into the batches they left (serialized units that are still \`sold\` on this bill return to \`inStock\`); the payment recorded when the bill was generated (\`PMT-\` + bill number) is deleted, so \`paid\` and \`due\` drop it; status becomes \`cancelled\` with \`cancelledAt\` and \`cancelReason\`.\n\n400 \`This bill is already cancelled\`. 400 \`This bill was revised \u2014 use the replacement bill\` when status is \`superseded\`. 409 \`Bill BILL-0004 is on an invoice and can't be cancelled\` when status is \`billed\` or \`bill\` is set. 409 \`This bill was just changed. Refresh and try again\`. Missing row: 404 \`Bill not found\`. Non-hex id: 404 \`E-way bill not found\`.`,
      [pathId('id', 'Bill id.')],
      jsonBody('Reason is optional. Max 300 characters. Omitted stores an empty reason.', {
        type: 'object',
        properties: { reason: str('Why it was cancelled. Max 300. Blank allowed.') },
      }, { reason: 'Wrong materials issued' }),
      done(200, 'The cancelled bill. `paid` on the document is the snapshot from creation; the payment row itself is gone.', ewaySchema, { ...ewayExample, status: 'cancelled', cancelReason: 'Wrong materials issued' }, { ...V, ...N, ...C }),
    ),
  },
  '/api/billing/eway-bills/{id}/returnable': {
    get: op(
      'billingReturnableEwayBill',
      'Billing',
      'Lines still on an open bill',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nWhat a revise form can send back. Only status \`open\`, else 400 \`Only an open product bill can be revised\`. \`lines[].line\` is the index in \`lines\` of a goods line (services are omitted). \`qtyLeft\` is the full quantity still on the bill (this call does not subtract earlier partial returns; revise is one shot that supersedes the bill). \`serials\` lists serials on that line. Missing row: 404 \`Bill not found\`. Non-hex id: 404 \`E-way bill not found\`.`,
      [pathId('id', 'Bill id.')],
      null,
      done(200, 'Bill header plus returnable goods lines.', {
        type: 'object',
        properties: {
          bill: { type: 'object', properties: { id: oid, ewayNo: { type: 'string' }, status: { type: 'string', enum: ewayStatus }, total: money } },
          lines: { type: 'array', items: { type: 'object', properties: { line: { type: 'integer' }, name: { type: 'string' }, detail: { type: 'string' }, batchNo: { type: 'string' }, unit: { type: 'string' }, qty: { type: 'number' }, serials: { type: 'array', items: { type: 'string' } }, qtyLeft: { type: 'number' } } } },
        },
      }, { bill: { id: '665f1c2a3b4d5e6f7a8b9c0d', ewayNo: 'BILL-0004', status: 'open', total: 22400 }, lines: [{ line: 0, name: '550 W panel', detail: '', batchNo: 'LOT-12', unit: 'Nos', qty: 2, serials: [], qtyLeft: 2 }] }, N),
    ),
  },
  '/api/billing/eway-bills/{id}/revise': {
    post: op(
      'billingReviseEwayBill',
      'Billing',
      'Return some goods on an open bill',
      `${FIN} ${perm('finances', 'create_eway_bill', 'Finances \u203a Create bill')}\n\nPartial return while the bill is \`open\`. This is how goods come back. Do not use the credit-note route.\n\nOne transaction: returned quantity or serials go back to stock (\`inStock\`, \`qtyRemaining\` increases). This bill becomes \`superseded\` (read-only) with \`cancelReason\` \`Revised: {reason}\` or, if nothing remains, \`All products returned: {reason}\`. If any goods or services remain, a new open bill is created (new \`BILL-\` number, same services, same discount and GST rules, \`supersedes\` pointing here) and the response \`replacement\` is that bill. The payment moves onto the replacement, capped at the new total (\`receiptNo\` becomes \`PMT-\` plus the new number). If the new total is under 0.01 the payment is deleted. If every goods line is returned and there are no services, \`replacement\` is null and the payment is deleted.\n\n\`lines[].line\` is the index from the returnable call. Each index once, else 400 \`Each line can be listed once\`. Unknown index: 400 \`Choose a product line from this bill\`. Serialized: send \`serials\` (400 \`Choose serial numbers for {name}\` if empty; 400 \`{sn} is not on this line\` / \`are not on this line\`). Not serialized: send \`qty\` > 0 (400 \`Enter how many {name} came back\`; 400 \`Only {n} {unit} on this line\`). Not open: 400 \`Only an open product bill can be revised\`. Empty reason: validation \`Reason is required\`, and the service also says \`Say why the products came back\`. 409 \`This bill was just changed. Refresh and try again\`. 409 \`Some serial numbers are not on this bill or were already returned\`. 409 \`Some units are no longer on this bill. Refresh and try again\`. Missing row: 404 \`Bill not found\`.`,
      [pathId('id', 'Open bill id.')],
      jsonBody('At least one line. `issuedOn` is the replacement bill\u2019s date (ISO). Omitted means now.', {
        type: 'object',
        required: ['lines', 'reason'],
        properties: {
          lines: {
            type: 'array', minItems: 1, maxItems: 100,
            items: {
              type: 'object',
              required: ['line'],
              properties: {
                line: { type: 'integer', minimum: 0, maximum: 1000, description: 'Index of the goods line on the bill.' },
                qty: { type: 'number', minimum: 0, maximum: 1000000, description: 'How many come back. Non-serialized lines.' },
                serials: { type: 'array', maxItems: 2000, items: { type: 'string', maxLength: 80 }, description: 'Serials coming back. Serialized lines.' },
              },
            },
          },
          reason: str('Required. Max 300.', 'Customer took fewer panels'),
          issuedOn: str('ISO 8601 date for the replacement bill. Omitted: now. This handler does not check the date the way create does \u2014 send a real ISO string.'),
        },
      }, { lines: [{ line: 0, qty: 1 }], reason: 'Customer took fewer panels', issuedOn: '2026-11-23T09:00:00.000Z' }),
      done(200, '`superseded` is the old bill. `replacement` is the new open bill, or null when nothing was left to bill.', {
        type: 'object',
        required: ['superseded', 'replacement'],
        properties: { superseded: ewaySchema, replacement: { nullable: true, allOf: [ewaySchema] } },
      }, { superseded: { ...ewayExample, status: 'superseded', cancelReason: 'Revised: Customer took fewer panels', supersededByNo: 'BILL-0005' }, replacement: { ...ewayExample, id: '665f1c2a3b4d5e6f7a8b9c0e', ewayNo: 'BILL-0005', total: 11200, supersedesNo: null } }, { ...V, ...N, ...C }),
    ),
  },
  '/api/billing/eway-bills/{id}/pdf': {
    post: op(
      'billingAttachEwayBillPdf',
      'Billing',
      'Archive the bill PDF',
      `${FIN} ${perm('finances', 'create_eway_bill', 'Finances \u203a Create bill')}\n\n${PDF_ONCE.replace('{document}', 'e-way bill')}\n\nMissing row: 404 \`E-way bill not found\`.`,
      [pathId('id', 'Bill id.')],
      fileBody('PDF only. Field name `file`.'),
      done(201, 'Archive acknowledgement. Not the bill and not the file bytes.', pdfOk, { ok: true, pdfName: '665f1c2a3b4d5e6f7a8b9c01-ewaybill-665f1c2a3b4d5e6f7a8b9c0d-ab12cd34.pdf' }, { ...N, ...C }),
    ),
  },
  '/api/billing/bills': {
    get: op(
      'billingListBills',
      'Billing',
      'List older tax invoices',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nOlder tax invoices (Mongo model Bill, field \`billNo\`). New sales do not create these; the bill you create is \`POST /api/billing/eway-bills\`. Newest first. \`{ items, total, page, limit }\`, default limit 50, max 200. \`from\` / \`to\` filter \`issuedOn\` (\`YYYY-MM-DD\`). \`status\`: \`paid\`, \`invoiced\`, or \`void\`. Any other value matches nothing. Populated: \`client\` \`{ id, name }\`, \`design\` \`{ id, name }\` or null, \`ewayBills\` \`[{ id, ewayNo }]\`, \`invoice\` \`{ id, invoiceNo }\` or null.`,
      [...pageLimit, ...fromTo('issuedOn'), q('status', { type: 'string', enum: billStatus }, 'Optional. Unknown values return an empty page.')],
      null,
      done(200, 'One page of older invoices.', pageOf(legacyBillSchema), {
        items: [{ id: '665f1c2a3b4d5e6f7a8b9c40', billNo: 'INV-0002', status: 'paid', total: 22400, issuedOn: '2026-10-01T00:00:00.000Z', title: '12 kW rooftop \u2014 Sharma', client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma' }, design: { id: '665f1c2a3b4d5e6f7a8b9c02', name: '12 kW rooftop \u2014 Sharma' }, ewayBills: [{ id: '665f1c2a3b4d5e6f7a8b9c0d', ewayNo: 'BILL-0001' }], invoice: null, creditedTotal: 0, pdfName: '' }],
        total: 1, page: 1, limit: 50,
      }),
    ),
  },
  '/api/billing/bills/uninvoiced': {
    get: op(
      'billingListUninvoicedBills',
      'Billing',
      'List a party\u2019s paid older invoices',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\n${PARTY}\n\nOlder invoices with status \`paid\` (not yet copied onto an Invoice row), oldest first. Not paged: the body is an array. \`ewayBills\` are \`{ id, ewayNo, issuedOn, total }\`. There is no route here that turns these into a new Invoice.`,
      partyQ,
      null,
      done(200, 'Array of paid older invoices.', { type: 'array', items: legacyBillSchema }, [], {
        ...N,
        400: { description: 'No party, or the proposal is not Booked.', content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } }, example: { error: 'The proposal must be Booked first' } } } },
      }),
    ),
  },
  '/api/billing/bills/{id}': {
    get: op(
      'billingGetBill',
      'Billing',
      'Get one older tax invoice',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\n${MONEY} \`client\` includes name, phone, email, address, gstNumber. \`design\` is \`{ id, name }\`. \`ewayBills\` include ewayNo, govtEwayNo, issuedOn, total, transport. \`invoice\` is \`{ id, invoiceNo }\` or null. Missing row: 404 \`Invoice not found\`. Non-hex id: 404 \`Bill not found\`.`,
      [pathId('id', 'Older invoice id (Bill).')],
      null,
      done(200, 'The older invoice.', legacyBillSchema, { id: '665f1c2a3b4d5e6f7a8b9c40', billNo: 'INV-0002', status: 'paid', total: 22400, creditedTotal: 0, issuedOn: '2026-10-01T00:00:00.000Z', client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma', phone: '9876543210', email: 'sharma@example.com', address: '', gstNumber: '' }, design: { id: '665f1c2a3b4d5e6f7a8b9c02', name: '12 kW rooftop \u2014 Sharma' }, ewayBills: [], invoice: null, pdfName: '' }, N),
    ),
  },
  '/api/billing/bills/{id}/pdf': {
    post: op(
      'billingAttachBillPdf',
      'Billing',
      'Archive an older invoice PDF',
      `${FIN} ${perm('finances', 'create_bill', 'Finances \u203a Create receipt')}\n\n${PDF_ONCE.replace('{document}', 'bill')}\n\nThis permission is the receipt permission. The stored noun in the 409 is \`bill\`. Missing row: 404 \`Bill not found\`.`,
      [pathId('id', 'Older invoice id.')],
      fileBody('PDF only. Field name `file`.'),
      done(201, 'Archive acknowledgement.', pdfOk, { ok: true, pdfName: '665f1c2a3b4d5e6f7a8b9c01-salebill-665f1c2a3b4d5e6f7a8b9c40-ab12cd34.pdf' }, { ...N, ...C }),
    ),
  },
  '/api/billing/bills/{id}/void': {
    post: op(
      'billingVoidBill',
      'Billing',
      'Void an older tax invoice',
      `${FIN} ${OWNER}\n\nVoids an older invoice that is still \`paid\` (not already on an Invoice row). The row stays, number is never reused, \`status\` becomes \`void\`, \`voidedAt\` / \`voidReason\` / \`voidedByName\` are set, and its payment row is deleted so ledgers drop the money.\n\n\`returnStock\` false or omitted: each linked bill goes back to \`open\` (stock stays out; the bill can be cancelled separately). \`returnStock\` true: those bills are \`cancelled\` and goods still \`sold\` on them return to stock. If a serial is no longer \`sold\`: 409 \`{serials} is no longer sold (installed or returned). Void without returning stock, or put it back in stock first\` (or \`are\` / \`them\`).\n\n400 \`Give the reason for voiding this invoice\` (also validation \`Reason is required\`). 400 \`This invoice is already void\`. 409 \`Goods have already been returned on invoice {billNo} (a credit note). It can't be voided; the rest of it stands\`. 409 \`Invoice {billNo} is on the older invoice {invoiceNo}. Void that one first\`. 409 \`This invoice was just changed. Refresh and try again\`. Missing row: 404 \`Invoice not found\`. Non-hex id: 404 \`Bill not found\`.`,
      [pathId('id', 'Older invoice id.')],
      jsonBody('Reason is required. `returnStock` defaults to false.', {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: str('Required. Max 300.', 'Issued to the wrong client'),
          returnStock: { type: 'boolean', description: 'True: cancel the linked bills and put goods back. False or omitted: reopen the bills and leave stock out.' },
        },
      }, { reason: 'Issued to the wrong client', returnStock: false }),
      done(200, 'The voided older invoice.', legacyBillSchema, { id: '665f1c2a3b4d5e6f7a8b9c40', billNo: 'INV-0002', status: 'void', total: 22400, voidReason: 'Issued to the wrong client', payment: null }, { ...V, ...N, ...C }),
    ),
  },
  '/api/billing/bills/{id}/credit-notes': {
    post: op(
      'billingCreateCreditNote',
      'Billing',
      'Credit note is disabled',
      `${FIN} ${OWNER}\n\nDo not build a return flow on this route. The handler always answers 400 \`Returns are handled on open product bills before invoicing. To undo a paid invoice, void it instead.\` after the body passes validation (no \`code\`). Return goods with \`POST /api/billing/eway-bills/{id}/revise\` while the bill is \`open\`. Undo a paid older invoice with \`POST /api/billing/bills/{id}/void\`.\n\nThe body is still validated, so a bad body is 400 \`code\` \`VALIDATION\` first. The schema (unused by a successful call) is: \`lines\` of \`{ line, qty, serials }\` (line index, at least one, each index once), \`reason\` required max 300, optional \`issuedOn\` ISO, optional \`idempotencyKey\`, and \`refund\` \`{ mode, reference, refundedOn, note }\` with \`mode\` one of ${payModes.join(', ')}.`,
      [pathId('id', 'Older invoice id. Not read: the handler rejects before loading it.')],
      jsonBody('Validated, then rejected.', {
        type: 'object',
        required: ['lines', 'reason', 'refund'],
        properties: {
          lines: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['line'], properties: { line: { type: 'integer', minimum: 0, maximum: 1000 }, qty: { type: 'number' }, serials: { type: 'array', items: { type: 'string', maxLength: 80 } } } } },
          reason: str('Required. Max 300.'),
          issuedOn: str('ISO 8601. Not read.'),
          idempotencyKey: str('Not read.'),
          refund: { type: 'object', required: ['mode'], properties: { mode: { type: 'string', enum: payModes }, reference: { type: 'string' }, refundedOn: { type: 'string' }, note: { type: 'string' } } },
        },
      }, { lines: [{ line: 0, qty: 1 }], reason: 'Customer returned a panel', refund: { mode: 'upi', reference: 'UPI1' } }),
      done(400, 'A valid body still fails with this message and no `code`. A body that fails the schema is also 400, with `code` `VALIDATION` and `details.fields` (the shared validation error).', { type: 'object', required: ['error'], properties: { error: { type: 'string' }, code: { type: 'string' }, details: { type: 'object' } } }, { error: 'Returns are handled on open product bills before invoicing. To undo a paid invoice, void it instead.' }),
    ),
  },
  '/api/billing/credit-notes': {
    get: op(
      'billingListCreditNotes',
      'Billing',
      'List credit notes',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nExisting credit notes, newest first. \`{ items, total, page, limit }\`, default limit 50, max 200. \`from\` / \`to\` filter \`issuedOn\`. Populated: \`client\` \`{ id, name }\`, \`design\` \`{ id, name }\`, \`bill\` \`{ id, billNo }\`. No new credit notes can be created.`,
      [...pageLimit, ...fromTo('issuedOn')],
      null,
      done(200, 'One page of credit notes.', pageOf(creditNoteSchema), { items: [], total: 0, page: 1, limit: 50 }),
    ),
  },
  '/api/billing/credit-notes/{id}': {
    get: op(
      'billingGetCreditNote',
      'Billing',
      'Get one credit note',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\n\`client\` includes name, phone, email, address, gstNumber. \`design\` is \`{ id, name }\`. \`bill\` is \`{ id, billNo, issuedOn }\`. \`invoice\` is \`{ id, invoiceNo }\` or null. Missing: 404 \`Credit note not found\` (same noun for a bad id).`,
      [pathId('id', 'Credit note id.')],
      null,
      done(200, 'The credit note.', creditNoteSchema, { id: '665f1c2a3b4d5e6f7a8b9c50', creditNo: 'CN-0001', total: 1120, reason: 'Panel returned', issuedOn: '2026-10-02T00:00:00.000Z', bill: { id: '665f1c2a3b4d5e6f7a8b9c40', billNo: 'INV-0002', issuedOn: '2026-10-01T00:00:00.000Z' }, refund: { amount: 1120, mode: 'upi', reference: '', refundedOn: '2026-10-02T00:00:00.000Z', note: '' } }, N),
    ),
  },
  '/api/billing/credit-notes/{id}/pdf': {
    post: op(
      'billingAttachCreditNotePdf',
      'Billing',
      'Archive a credit-note PDF',
      `${FIN} ${OWNER}\n\n${PDF_ONCE.replace('{document}', 'credit note')}\n\nMissing row: 404 \`Credit note not found\`.`,
      [pathId('id', 'Credit note id.')],
      fileBody('PDF only. Field name `file`.'),
      done(201, 'Archive acknowledgement.', pdfOk, { ok: true, pdfName: '665f1c2a3b4d5e6f7a8b9c01-creditnote-665f1c2a3b4d5e6f7a8b9c50-ab12cd34.pdf' }, { ...N, ...C }),
    ),
  },
  '/api/billing/invoices/{id}/void': {
    post: op(
      'billingVoidInvoice',
      'Billing',
      'Void an invoice made from older invoices',
      `${FIN} ${OWNER}\n\nVoids an Invoice row that was built from older invoices (\`bills\` is non-empty). The number is kept. Status becomes \`void\`. Those older invoices go back to \`paid\` (their \`invoice\` cleared) so they can be voided or placed again. Serial units sold on it have \`soldInvoice\` cleared; stock is not returned. \`returnStock\` in the body is ignored.\n\n400 \`Give the reason for voiding this invoice\`. 400 \`This invoice is already void\`. 400 \`Only an invoice made from bills can be voided here\` (AMC parts invoices, which have no bills). 409 \`This invoice was just changed. Refresh and try again\`. Missing or non-hex id: 404 \`Invoice not found\`.`,
      [pathId('id', 'Invoice id.')],
      jsonBody('Reason is required. `returnStock` is ignored on this route.', {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: str('Required. Max 300.', 'Wrong buyer on the tax invoice'),
          returnStock: { type: 'boolean', description: 'Accepted by the schema and ignored. Stock does not move.' },
        },
      }, { reason: 'Wrong buyer on the tax invoice' }),
      done(200, 'The voided Invoice row.', invoiceSchema, { id: '665f1c2a3b4d5e6f7a8b9c30', invoiceNo: 'INV-0003', status: 'void', kind: 'sale', total: 22400, voidReason: 'Wrong buyer on the tax invoice' }, { ...V, ...N, ...C }),
    ),
  },
  '/api/billing/invoices/{id}/pdf': {
    post: op(
      'billingAttachInvoicePdf',
      'Billing',
      'Archive an invoice PDF',
      `${FIN} ${perm('finances', 'create_invoice', 'Finances \u203a Create AMC parts invoice')}\n\n${PDF_ONCE.replace('{document}', 'invoice')}\n\nMissing row: 404 \`Invoice not found\`.`,
      [pathId('id', 'Invoice id.')],
      fileBody('PDF only. Field name `file`.'),
      done(201, 'Archive acknowledgement.', pdfOk, { ok: true, pdfName: '665f1c2a3b4d5e6f7a8b9c01-invoice-665f1c2a3b4d5e6f7a8b9c30-ab12cd34.pdf' }, { ...N, ...C }),
    ),
  },
  '/api/billing/receipts': {
    get: op(
      'billingListReceipts',
      'Billing',
      'List receipts',
      `${FIN} ${perm('finances', 'view', 'Finances \u203a View')}\n\nReceipts only: payment rows whose \`bill\` and \`ewayBill\` are both null. Money taken automatically when a bill is generated (\`PMT-BILL-\u2026\`) is not in this list; it still counts in ledger \`paid\`. Newest \`receivedOn\` first. \`{ items, total, page, limit }\`, default limit 50, max 200. \`from\` / \`to\` filter \`receivedOn\` (\`YYYY-MM-DD\`). \`client\` is \`{ id, name, phone, email, address, gstNumber }\`. \`design\` is \`{ id, name }\` or null. \`contractTotal\` is what was billed at the time. \`balanceAfter\` is that minus all payments including this one (negative means an advance).`,
      [...pageLimit, ...fromTo('receivedOn')],
      null,
      done(200, 'One page of receipts.', pageOf(receiptSchema), { items: [receiptExample], total: 1, page: 1, limit: 50 }),
    ),
    post: op(
      'billingCreateReceipt',
      'Billing',
      'Record money received',
      `${FIN} ${perm('finances', 'create_bill', 'Finances \u203a Create receipt')}\n\n${PARTY} Send \`design\` or \`client\` in the body.\n\nRecords any amount: part of what is due, all of it, or an advance before anything is billed. It does not move stock and it does not change a bill. The row is numbered \`RCPT-0001\`. \`contractTotal\` is the party\u2019s billed total at that moment (open bills + non-void older invoices). \`balanceAfter\` is \`contractTotal\` minus every payment on the party including this receipt.\n\n\`amount\` must be at least 0.01 or 400 \`Enter the amount received\`. \`mode\` is required. \`receivedOn\` is ISO; omitted means now; unparseable: 400 \`Invalid date\`; more than 24 hours ahead: 400 \`The receipt date can\u2019t be in the future\`. \`receivedBy\` omitted: the signed-in user\u2019s name or email. ${IDEM}`,
      null,
      jsonBody('Party, amount, and how it was received.', {
        type: 'object',
        required: ['amount', 'mode'],
        properties: {
          design: { description: 'Booked proposal id, or blank.', anyOf: [oid, { type: 'string', maxLength: 0 }] },
          client: { description: 'Client id when there is no proposal.', anyOf: [oid, { type: 'string', maxLength: 0 }] },
          idempotencyKey: str('8\u201364 of letters, digits, `_`, `-`. Anything else is ignored.'),
          amount: { type: 'number', minimum: 0.01, maximum: 1e10, description: 'Rupees received. Required.' },
          mode: { type: 'string', enum: payModes, description: 'Required.' },
          reference: str('UPI / cheque / bank reference. Max 80.'),
          receivedOn: str('ISO 8601. Omitted: now. Not more than 24 hours in the future.'),
          receivedBy: str('Who took the money. Max 120. Omitted: the signed-in user.'),
          reason: str('Why, printed on the receipt. Max 300.'),
        },
      }, { design: '665f1c2a3b4d5e6f7a8b9c02', amount: 5000, mode: 'upi', reference: 'UPI9988', receivedOn: '2026-11-23T08:00:00.000Z', reason: 'Advance before material', idempotencyKey: 'rcpt-sharma-5000' }),
      done(201, 'The receipt. A repeat with the same idempotency key is also 201.', receiptSchema, receiptExample, { ...V, ...N }),
    ),
  },
  '/api/billing/receipts/{id}/pdf': {
    post: op(
      'billingAttachReceiptPdf',
      'Billing',
      'Archive a receipt PDF',
      `${FIN} ${perm('finances', 'create_bill', 'Finances \u203a Create receipt')}\n\n${PDF_ONCE.replace('{document}', 'receipt')}\n\nMissing row: 404 \`Receipt not found\`. There is no \`GET /api/billing/receipts/{id}\`; the list and the party ledger return the row, including \`pdfName\` after this call.`,
      [pathId('id', 'Receipt id.')],
      fileBody('PDF only. Field name `file`.'),
      done(201, 'Archive acknowledgement.', pdfOk, { ok: true, pdfName: '665f1c2a3b4d5e6f7a8b9c01-receipt-665f1c2a3b4d5e6f7a8b9c10-ab12cd34.pdf' }, { ...N, ...C }),
    ),
  },
  '/api/billing/receipts/{id}': {
    delete: op(
      'billingDeleteReceipt',
      'Billing',
      'Delete a receipt',
      `${FIN} ${OWNER}\n\nRemoves a receipt. The number is not reused. Ledger \`paid\` drops this amount at once. An archived PDF file is deleted with it. The response includes the number that was removed.\n\nThis is not the payment of a bill: 400 \`{receiptNo} is the payment of a bill. Cancel that bill instead\` when \`ewayBill\` is set, and 400 \`{receiptNo} is the payment of an invoice. Void that invoice instead\` when \`bill\` is set. Missing or non-hex id: 404 \`Receipt not found\`.`,
      [pathId('id', 'Receipt id.')],
      null,
      done(200, 'The receipt is gone.', { type: 'object', required: ['ok', 'receiptNo'], properties: { ok: { type: 'boolean', enum: [true] }, receiptNo: { type: 'string', example: 'RCPT-0004' } } }, { ok: true, receiptNo: 'RCPT-0004' }, {
        ...N,
        400: { description: 'This row is the payment of a bill or an older invoice, not a receipt.', content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } }, example: { error: 'PMT-BILL-0004 is the payment of a bill. Cancel that bill instead' } } } },
      }),
    ),
  },
};

const STOCK_VIEW = `${STOCK_MOUNT} Staff need \u201cInventory \u203a View\u201d or \u201cFinances \u203a View\u201d or \u201cInstallations \u203a View all\u201d, else 403 \`You need the \u201cInventory \u203a View\u201d or \u201cFinances \u203a View\u201d or \u201cInstallations \u203a View all\u201d permission. Ask your company admin.\``;
const STOCK_CREATE = `${STOCK_MOUNT} ${perm('inventory', 'create', 'Inventory \u203a Create')} Reads do not require this. Every stock write also requires the product to be inactive, else 409 \`Mark \u201c{product name}\u201d inactive before you {action}\`.`;
const STOCK_UPDATE = `${STOCK_MOUNT} ${perm('inventory', 'update', 'Inventory \u203a Edit')} The product must be inactive (same 409, action named in each route).`;

const batchInput = {
  type: 'object',
  description: 'On receive, `supplier` and the three selling prices are required. On update, every key is optional: omit a key to leave it. Sending null or "" for a price leaves that price. `mfgDate` null or "" clears it. `receivedDate` null or "" does not clear it.',
  properties: {
    supplier: { ...oid, description: 'Required on receive. On update, send it only to change the supplier. Unknown: 404 `Supplier not found`. Missing on receive fails validation (24-hex id).' },
    batchNo: str('Optional. Max 60.'),
    mfgDate: { type: 'string', nullable: true, description: 'ISO 8601, or null. Invalid date fails validation (`Invalid date`).' },
    mfgYear: { type: 'integer', nullable: true, minimum: 1990, description: 'Whole year, 1990 through the year after the server process started (2027 if it started in 2026). Blank becomes null.' },
    receivedDate: { type: 'string', nullable: true, description: 'ISO 8601. Omitted on receive: now. On update, omit to keep it; null or "" does not clear it.' },
    purchasePrice: { type: 'number', minimum: 0, maximum: 1e10, description: 'What you paid per unit. Optional. Not a selling price.' },
    basePrice: { type: 'number', minimum: 0, maximum: 1e10, description: 'Selling price `base`. Required on receive. Bills pick this when `priceType` is `base`.' },
    wholesalePrice: { type: 'number', minimum: 0, maximum: 1e10, description: 'Selling price `wholesale`. Required on receive.' },
    retailPrice: { type: 'number', minimum: 0, maximum: 1e10, description: 'Selling price `retail`. Required on receive. Stock-on-hand price shown in the catalog uses this.' },
    note: str('Max 300.'),
    qtyReceived: { type: 'number', minimum: 0, maximum: 1e7, description: 'On receive, required in effect for a product that is not serialized (must be > 0; may be fractional). If the product is serialized and you send this, it must equal the serial count. On update it must be a whole number.' },
    qtyRemaining: { type: 'integer', minimum: 0, maximum: 1e7, description: 'Update only. Whole number. Cannot exceed quantity received, and cannot pretend units already sold are still in stock.' },
    serials: { type: 'array', maxItems: 2000, items: { type: 'string', maxLength: 80 }, description: 'Receive only, and only for a serialized product. One serial per item. Blanks dropped. A repeat in the same request (any case) is 400 `Serial number {sn} is listed twice`.' },
  },
};

Object.assign(billing, {
  '/api/stock/products/{id}/batches': {
    get: op(
      'stockListBatches',
      'Stock',
      'List a product\u2019s batches',
      `${STOCK_VIEW}\n\nEvery batch of this product. Not paged: the body is an array. \`inStock=true\` (the string \`true\` only) keeps \`qtyRemaining\` > 0 and sorts oldest first (the FIFO order sales use). Omitted, \`false\`, or anything else returns every batch, newest first. \`supplier\` is \`{ id, name }\`. Unknown product: 404 \`Product not found\`.`,
      [pathId('id', 'Product id.'), q('inStock', { type: 'string', enum: ['true'] }, 'Only the exact string `true` filters to batches that still have stock and sorts oldest first.')],
      null,
      done(200, 'Array of batches. Empty when the product has none.', { type: 'array', items: batchSchema }, [batchExample], N),
    ),
    post: op(
      'stockReceiveBatch',
      'Stock',
      'Receive stock into a new batch',
      `${STOCK_CREATE}\n\nAction in the 409 is \`receive stock\`.\n\nOne new batch, and for a serialized product one unit per serial number (\`status\` \`inStock\`). \`qtyReceived\` and \`qtyRemaining\` both start at that quantity. This does not create a sale.\n\nNot serialized: \`qtyReceived\` must be > 0, else 400 \`Enter the quantity received\`. Serials are ignored. Serialized: serials are required, else 400 \`{name} is tracked by serial number: enter the serial number of every item received\`. If \`qtyReceived\` is also sent and differs: 400 \`Quantity is {n} but {m} serial numbers were entered\`. A serial already in this company: 409 \`Already received: {serials}\` (up to 10 listed). A duplicate unique index can also be 409 \`That value is already in use\`.\n\nPrices are per unit. \`basePrice\`, \`wholesalePrice\`, and \`retailPrice\` are required and are what a later bill charges (\`priceType\` \`base\` / \`wholesale\` / \`retail\`). \`purchasePrice\` is what you paid and is optional. Dates in the body are ISO 8601 (or null). The response dates are ISO. Unknown product: 404 \`Product not found\`.`,
      [pathId('id', 'Product id.')],
      jsonBody('Supplier, three selling prices, and either a quantity or serial numbers.', {
        ...batchInput,
        required: ['supplier', 'basePrice', 'wholesalePrice', 'retailPrice'],
      }, { supplier: '665f1c2a3b4d5e6f7a8b9c06', batchNo: 'LOT-12', mfgYear: 2026, qtyReceived: 10, purchasePrice: 8000, basePrice: 9000, wholesalePrice: 9500, retailPrice: 10000, receivedDate: '2026-11-20T00:00:00.000Z' }),
      done(201, 'The new batch. `supplier` and `product` are ids.', batchSchema, batchExample, { ...V, ...N, ...C }),
    ),
  },
  '/api/stock/products/{id}/units': {
    get: op(
      'stockListUnits',
      'Stock',
      'List a serialized product\u2019s units',
      `${STOCK_VIEW}\n\nUnits of this product, oldest first (then serial number). \`batch\` is \`{ id, batchNo, receivedDate }\`. \`installedProject\` is \`{ id, design: { id, name } }\` or null. \`warrantyEnd\` is computed from \`installDate\` and the product warranty.\n\nWithout query \`page\`, the body is the full array (pickers need every in-stock unit). With \`page\` present, the body is \`{ items, total, page, limit }\`. That page size defaults to 10 and is clamped to 100 (not 50 / 200).\n\n\`status\` is used only when it is \`inStock\`, \`sold\`, \`installed\`, or \`returned\`. Any other value is ignored (all statuses), not a 400. \`q\` is a case-insensitive substring of \`serialNo\`, trimmed, first 80 characters. \`batch\` limits to that batch; a non-hex value is 404 \`Batch not found\`. Unknown product: 404 \`Product not found\`.`,
      [
        pathId('id', 'Product id.'),
        q('status', { type: 'string', enum: unitStatus }, 'Ignored unless it is one of these four.'),
        q('q', { type: 'string', maxLength: 80 }, 'Case-insensitive substring of the serial number. Longer values are cut to 80.'),
        q('batch', oid, 'Only units in this batch.'),
        q('page', { type: 'integer', minimum: 1 }, 'Omit for the full list. Present (even `1`): paged object.'),
        q('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10 }, 'Used only when `page` is present. Default 10, max 100.'),
      ],
      null,
      done(200, 'An array when `page` is omitted, or `{ items, total, page, limit }` when `page` is sent.', {
        description: 'Array of units, or a page object. Read `page` on the query to know which.',
        oneOf: [{ type: 'array', items: unitSchema }, pageOf(unitSchema)],
      }, { items: [{ id: '665f1c2a3b4d5e6f7a8b9c21', serialNo: 'PNL-0001', status: 'inStock', product: '665f1c2a3b4d5e6f7a8b9c04', batch: { id: '665f1c2a3b4d5e6f7a8b9c05', batchNo: 'LOT-12', receivedDate: '2026-11-20T00:00:00.000Z' }, soldInvoice: null, soldEwayBill: null, installedProject: null, installDate: null, warrantyEnd: null }], total: 1, page: 1, limit: 10 }, N),
    ),
  },
  '/api/stock/batches/{id}/bill': {
    post: op(
      'stockAttachBatchBill',
      'Stock',
      'Attach the supplier\u2019s bill to a batch',
      `${STOCK_CREATE}\n\nAction in the 409 is \`attach a bill to a batch\`.\n\nMultipart field \`file\`, one file, 20 MB. PNG, JPG, WebP, or PDF. Declared type rejected: 400 \`Upload a PNG, JPG, WebP image or a PDF\`. Bytes that are not one of those: 400 \`That file is not a valid PNG, JPG, WebP image or PDF\`. Over 20 MB: 400 \`That file is too large\`. No file: 400 \`Choose the bill to upload (PDF or image)\`. Same upload rate limit as other files (60 per user per 10 minutes, 3 at once).\n\nA previous bill on this batch is replaced and its file deleted. The response is the batch, not the file. \`billUrl\` is \`/uploads/{stored name}\`. \`billName\` is the original name (max 200). Unknown batch: 404 \`Batch not found\`.`,
      [pathId('id', 'Batch id.')],
      fileBody('PNG, JPG, WebP, or PDF. Field name `file`. Up to 20 MB.'),
      done(201, 'The batch, with `billUrl` and `billName` set.', batchSchema, { ...batchExample, billUrl: '/uploads/665f1c2a3b4d5e6f7a8b9c01-bill-665f1c2a3b4d5e6f7a8b9c05-ab12cd34.pdf', billName: 'supplier-invoice.pdf' }, { ...N, ...C }),
    ),
  },
  '/api/stock/batches/{id}': {
    put: op(
      'stockUpdateBatch',
      'Stock',
      'Update a batch',
      `${STOCK_UPDATE}\n\nAction in the 409 is \`edit a batch or receive stock\`.\n\nPartial: omit a key to leave it. You can correct the supplier, batch number, dates, prices, note, and \u2014 only when the product is not serialized \u2014 \`qtyReceived\` and \`qtyRemaining\` (both whole numbers).\n\nSerialized quantity changes are refused: 400 \`Adjust quantity by adding or removing serial numbers in this lot\`. Use add-serials or remove-units.\n\nNon-serialized quantity rules. \`qtyRemaining\` cannot exceed \`qtyReceived\`: 400 \`In stock can\u2019t be more than the quantity received\`. You cannot set \`qtyReceived\` below the number already sold or issued: 409 \`Quantity received can\u2019t be less than {n} \u2014 that many {unit} were already sold or issued from this batch.\` If the in-stock figure would imply fewer dispatched than already left: 409 \`This batch had {n} sold or issued \u2014 with {remaining} in stock, quantity received must be at least {sum}, or lower the in-stock quantity.\` Bad numbers: 400 \`Enter a valid quantity received\` or \`Enter a valid quantity in stock\`. Prices must be \u2265 0 or 400 \`Prices must be 0 or more\`. Unknown batch: 404 \`Batch not found\`.`,
      [pathId('id', 'Batch id.')],
      jsonBody('Any subset of the batch fields. Omit a key to leave it.', batchInput, { retailPrice: 10500, note: 'Price corrected' }),
      done(200, 'The updated batch.', batchSchema, { ...batchExample, retailPrice: 10500, note: 'Price corrected' }, { ...V, ...N, ...C }),
    ),
  },
  '/api/stock/batches/{id}/remove-units': {
    post: op(
      'stockRemoveUnitsFromBatch',
      'Stock',
      'Remove in-stock serials from a batch',
      `${STOCK_UPDATE}\n\nAction in the 409 is \`adjust stock\`.\n\nDeletes the chosen units and subtracts that count from both \`qtyReceived\` and \`qtyRemaining\`. Only units that are still \`inStock\` on this batch. A unit in another state: 409 \`Only units still in stock can be removed. {serial} is {in stock|sold|installed|returned}.\` Some ids not on this batch: 400 \`Some units were not found in this lot\`. Empty selection: validation \`Choose at least one unit\`, and the service says \`Choose at least one unit to remove from inventory\`. Race: 409 \`Could not update batch quantities \u2014 refresh and try again\`. Up to 2000 ids. Unknown batch: 404 \`Batch not found\`.`,
      [pathId('id', 'Batch id.')],
      jsonBody('Unit ids to delete from inventory.', {
        type: 'object',
        required: ['unitIds'],
        properties: { unitIds: { type: 'array', minItems: 1, maxItems: 2000, items: oid } },
      }, { unitIds: ['665f1c2a3b4d5e6f7a8b9c21'] }),
      done(200, 'The batch after the counts drop.', batchSchema, { ...batchExample, qtyReceived: 9, qtyRemaining: 9 }, { ...V, ...N, ...C }),
    ),
  },
  '/api/stock/batches/{id}/add-serials': {
    post: op(
      'stockAddSerialsToBatch',
      'Stock',
      'Add serials to an existing batch',
      `${STOCK_CREATE}\n\nAction in the 409 is \`add stock to a lot\`.\n\nAdds in-stock units to this batch and increases \`qtyReceived\` and \`qtyRemaining\` by how many non-blank serials remain. The product must be serialized, else 400 \`This product is not tracked by serial number\`. Blanks are dropped. A repeat in the request: 400 \`Serial number {sn} is listed twice\`. Already in the company: 409 \`Already received: {serials}\`. At least one entry or validation \`Enter at least one serial number\` (an array of only blanks passes that check and adds nothing). Up to 2000. Each serial max 80. Unknown batch: 404 \`Batch not found\`.`,
      [pathId('id', 'Batch id.')],
      jsonBody('Serial numbers to add. One physical unit each.', {
        type: 'object',
        required: ['serials'],
        properties: { serials: { type: 'array', minItems: 1, maxItems: 2000, items: { type: 'string', maxLength: 80 } } },
      }, { serials: ['PNL-0011', 'PNL-0012'] }),
      done(201, 'The batch after the counts rise. The new units are not listed here; read `GET /api/stock/products/{id}/units`.', batchSchema, { ...batchExample, qtyReceived: 12, qtyRemaining: 12 }, { ...V, ...N, ...C }),
    ),
  },
  '/api/stock/batches/{id}/void': {
    post: op(
      'stockVoidBatch',
      'Stock',
      'Void a whole batch',
      `${STOCK_UPDATE}\n\nAction in the 409 is \`void a lot\`.\n\nDeletes the batch. No request body. Serialized: every unit must still be \`inStock\`, then those units are deleted. Otherwise 409 \`This lot can\u2019t be voided: {n} unit(s) are sold, installed, or returned. Cancel open bills or return stock first.\` Not serialized: \`qtyReceived\` must still equal \`qtyRemaining\`, else 409 \`Some of this batch was already sold or issued \u2014 the lot can\u2019t be voided.\` A supplier bill file on the batch is deleted with it. Unknown batch: 404 \`Batch not found\`.`,
      [pathId('id', 'Batch id.')],
      null,
      done(200, 'The batch no longer exists.', okSchema, { ok: true }, { ...N, ...C }),
    ),
  },
  '/api/stock/units': {
    get: op(
      'stockFindUnit',
      'Stock',
      'Find a unit by serial number',
      `${STOCK_VIEW}\n\nExact \`serial\` after trim (case-sensitive). Empty or missing: 400 \`Enter a serial number\`. Not in this company: 404 \`Unit not found\`.\n\n\`product\` is \`{ id, name, brand, model, warrantyMonths }\`. \`batch\` is \`{ id, batchNo, receivedDate }\`. \`installedProject\` includes \`design\` \`{ id, name }\` and \`client\` \`{ id, name }\`. \`soldInvoice\` is \`{ id, invoiceNo, issuedOn }\` or null. \`soldEwayBill\` is \`{ id, ewayNo, issuedOn }\` or null. \`warrantyEnd\` is the install date plus the product warranty, or null.`,
      [q('serial', { type: 'string', maxLength: 80 }, 'Exact serial number. Required.')],
      null,
      done(200, 'The unit plus the invoice and bill that sold it, when those exist.', unitSchema, {
        id: '665f1c2a3b4d5e6f7a8b9c21', serialNo: 'PNL-0001', status: 'sold',
        product: { id: '665f1c2a3b4d5e6f7a8b9c04', name: '550 W panel', brand: 'Acme', model: 'A550', warrantyMonths: 120 },
        batch: { id: '665f1c2a3b4d5e6f7a8b9c05', batchNo: 'LOT-12', receivedDate: '2026-11-20T00:00:00.000Z' },
        soldInvoice: null, soldEwayBill: { id: '665f1c2a3b4d5e6f7a8b9c0d', ewayNo: 'BILL-0004', issuedOn: '2026-11-23T07:30:00.000Z' },
        installedProject: null, installDate: null, warrantyEnd: null,
      }, {
        400: { description: 'No serial was sent.', content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } }, example: { error: 'Enter a serial number' } } } },
        ...N,
      }),
    ),
  },
  '/api/stock/units/{id}/status': {
    put: op(
      'stockSetUnitStatus',
      'Stock',
      'Move a serial unit by hand',
      `${STOCK_UPDATE}\n\nAction in the 409 is \`manage serial units\`.\n\nSelling and issuing do not use this route (a bill takes units out of stock). Allowed moves: \`sold\` \u2192 \`installed\`, \`sold\` \u2192 \`returned\`, \`installed\` \u2192 \`returned\`, \`returned\` \u2192 \`inStock\`. Anything else: 400 \`A unit that is {from} can't be marked {to}\` (\`from\` / \`to\` are the words in stock, sold, installed, returned). A unit still \`inStock\` is refused even for \`sold\` or \`installed\`: 400 \`Sell it on an invoice instead\` (create a bill). While its bill is still \`open\`: 409 \`This unit is on bill {ewayNo}, which is still open. Invoice it or cancel it first\`.\n\n\`installed\` requires \`project\` (an installation id). Missing or unknown: 404 \`Installation not found\`. \`installDate\` is ISO; omitted, null, or "" means now. Unparseable: 400 \`Invalid install date\`. \`returned\` does not change the batch count. \`inStock\` clears \`soldInvoice\`, \`soldEwayBill\`, \`installedProject\`, and \`installDate\`, and adds 1 to the batch \`qtyRemaining\`. Race: 409 \`This unit was just changed. Refresh and try again\`. Unknown unit: 404 \`Unit not found\`.\n\nThe response is the unit. \`warrantyEnd\` is null here because the product is not loaded on this write. Read the unit list or the serial lookup for the warranty date.`,
      [pathId('id', 'Serial unit id.')],
      jsonBody('New status. `project` is required when the status is `installed`.', {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: unitStatus },
          project: { description: 'Installation id. Required when status is `installed`. Blank is 404 `Installation not found`.', anyOf: [oid, { type: 'string', maxLength: 0 }] },
          installDate: { type: 'string', nullable: true, description: 'ISO 8601. Omitted or blank: now. Only applied when status is `installed`.' },
        },
      }, { status: 'installed', project: '665f1c2a3b4d5e6f7a8b9c70', installDate: '2026-11-23T10:00:00.000Z' }),
      done(200, 'The unit after the move.', unitSchema, { id: '665f1c2a3b4d5e6f7a8b9c21', serialNo: 'PNL-0001', status: 'installed', product: '665f1c2a3b4d5e6f7a8b9c04', batch: '665f1c2a3b4d5e6f7a8b9c05', soldEwayBill: '665f1c2a3b4d5e6f7a8b9c0d', soldInvoice: null, installedProject: '665f1c2a3b4d5e6f7a8b9c70', installDate: '2026-11-23T10:00:00.000Z', warrantyEnd: null }, { ...V, ...N, ...C }),
    ),
  },
  '/api/suppliers': {
    get: op(
      'supplierList',
      'Suppliers',
      'List suppliers',
      `${STOCK_VIEW}\n\nEvery supplier of this branch, name A to Z. Not paged: the body is an array. \`categories\` are product-category ids. No search query.`,
      null,
      null,
      done(200, 'Array of suppliers.', { type: 'array', items: supplierSchema }, [{ id: '665f1c2a3b4d5e6f7a8b9c06', company: '665f1c2a3b4d5e6f7a8b9c01', name: 'Acme Solar', phone: '9876543210', email: 'orders@acme.example', gstNumber: '27ABCDE1234F1Z5', address: 'Pune', notes: '', categories: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]),
    ),
    post: op(
      'supplierCreate',
      'Suppliers',
      'Create a supplier',
      `${STOCK_MOUNT} ${perm('inventory', 'create', 'Inventory \u203a Create')}\n\nName is required (max 120) and stored with the first letter capitalised. The same name, ignoring case, is 409 \`You already have a supplier with that name\`.\n\n\`phone\` empty or an Indian mobile (stored as 10 digits) or \`+\` and a country code. \`email\` empty or a normal address, stored lowercase. \`gstNumber\` empty, a GSTIN, or another country\u2019s tax number (4\u201320 letters, digits, space, dot, slash, hyphen, at least two digits); stored uppercased. \`address\` max 400. \`notes\` max 500. \`categories\` up to 100 category ids from your catalog; an unknown id is 400 \`Choose the supplier\u2019s categories from your product categories\`.`,
      null,
      jsonBody('Name is required. Other fields are optional.', {
        type: 'object',
        required: ['name'],
        properties: {
          name: str('Required. Max 120.', 'Acme Solar'),
          phone: str('Optional. Indian mobile as 10 digits, or +country code.'),
          email: str('Optional.'),
          gstNumber: str('Optional GSTIN or other tax number.'),
          address: str('Max 400.'),
          notes: str('Max 500.'),
          categories: { type: 'array', maxItems: 100, items: oid },
        },
      }, { name: 'Acme Solar', phone: '9876543210', gstNumber: '27ABCDE1234F1Z5', address: 'Pune', categories: [] }),
      done(201, 'The supplier.', supplierSchema, { id: '665f1c2a3b4d5e6f7a8b9c06', company: '665f1c2a3b4d5e6f7a8b9c01', name: 'Acme Solar', phone: '9876543210', email: '', gstNumber: '27ABCDE1234F1Z5', address: 'Pune', notes: '', categories: [] }, { ...V, ...C }),
    ),
  },
  '/api/suppliers/{id}': {
    put: op(
      'supplierUpdate',
      'Suppliers',
      'Update a supplier',
      `${STOCK_MOUNT} ${perm('inventory', 'update', 'Inventory \u203a Edit')}\n\nPartial: omit a key to leave it. Sending \`name\` as blank fails validation \`Name is required\`. A rename that collides, ignoring case, is 409 \`You already have a supplier with that name\`. \`categories\`, when sent, replaces the list (same category check as create). Unknown supplier: 404 \`Supplier not found\`.`,
      [pathId('id', 'Supplier id.')],
      jsonBody('Any subset. Omit a key to leave it.', {
        type: 'object',
        properties: {
          name: str('Max 120. Blank is rejected.'),
          phone: str('Empty clears it.'),
          email: str('Empty clears it.'),
          gstNumber: str('Empty clears it.'),
          address: str('Max 400. Empty clears it.'),
          notes: str('Max 500. Empty clears it.'),
          categories: { type: 'array', maxItems: 100, items: oid, description: 'Replaces the list when sent.' },
        },
      }, { phone: '9876500000', notes: 'Net 30' }),
      done(200, 'The supplier.', supplierSchema, { id: '665f1c2a3b4d5e6f7a8b9c06', name: 'Acme Solar', phone: '9876500000', notes: 'Net 30' }, { ...V, ...N, ...C }),
    ),
    delete: op(
      'supplierDelete',
      'Suppliers',
      'Delete a supplier',
      `${STOCK_MOUNT} ${perm('inventory', 'delete', 'Inventory \u203a Delete')}\n\nOnly when no batch was received from them. Otherwise 409 \`Stock was received from this supplier, so it can\u2019t be deleted\`. Unknown: 404 \`Supplier not found\`.`,
      [pathId('id', 'Supplier id.')],
      null,
      done(200, 'Deleted.', okSchema, { ok: true }, { ...N, ...C }),
    ),
  },
  '/api/suppliers/{id}/purchases': {
    get: op(
      'supplierPurchases',
      'Suppliers',
      'List stock received from a supplier',
      `${STOCK_MOUNT} Staff need Inventory \u203a View or Finances \u203a View (Installations \u203a View all is not enough). 403 names those two.\n\nBatches bought from this supplier, newest \`receivedDate\` first, at most 500. Not the billing bills. \`purchasePrice\` is per unit. \`billUrl\` is \`/uploads/...\` or empty. Unknown supplier: 404 \`Supplier not found\`.`,
      [pathId('id', 'Supplier id.')],
      null,
      done(200, 'Array of purchase rows, max 500.', {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: oid, productId: oid, productName: { type: 'string' }, unit: { type: 'string' }, batchNo: { type: 'string' },
            receivedDate: iso, qtyReceived: { type: 'number' }, qtyRemaining: { type: 'number' }, purchasePrice: money, billUrl: { type: 'string' }, billName: { type: 'string' },
          },
        },
      }, [{ id: '665f1c2a3b4d5e6f7a8b9c05', productId: '665f1c2a3b4d5e6f7a8b9c04', productName: '550 W panel', unit: 'Nos', batchNo: 'LOT-12', receivedDate: '2026-11-20T00:00:00.000Z', qtyReceived: 10, qtyRemaining: 8, purchasePrice: 8000, billUrl: '', billName: '' }], N),
    ),
  },
  '/api/expenses': {
    get: op(
      'expenseOverview',
      'Expenses',
      'List projects with spend and budget',
      `${EXP_MOUNT} ${perm('expenses', 'view', 'Expenses \u203a View')}\n\nBooked proposals, plus any other proposal that already has an expense or a budget, newest update first, at most 1000. Not paged. \`q\` is a case-insensitive substring of the proposal name, client name, or address (trimmed, first 100 characters; not a regex).\n\n\`spent\` is the sum of expense amounts. \`budget\` is a saved budget, else the Booked proposal price when that price is above 0, else null. \`budgetSource\` is \`set\`, \`proposal\`, or null. \`budgetUsed\` is spent / budget \u00d7 100 to one decimal, or null when there is no positive budget. \`profit\` is budget \u2212 spent (negative means over budget), or null when there is no budget. \`totalSpent\` and \`totalBudget\` sum the rows after the search (a null budget counts as 0 in \`totalBudget\`).`,
      [q('q', { type: 'string' }, 'Search proposal name, client name, or address. First 100 characters.')],
      null,
      done(200, 'Matching projects plus the two totals.', {
        type: 'object',
        required: ['items', 'totalSpent', 'totalBudget'],
        properties: { items: { type: 'array', items: projectMoney }, totalSpent: money, totalBudget: money },
      }, {
        items: [{ id: '665f1c2a3b4d5e6f7a8b9c02', name: '12 kW rooftop \u2014 Sharma', status: 'won', address: 'Nashik', client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma' }, spent: 2500, count: 1, lastExpenseOn: '2026-11-22T00:00:00.000Z', budget: 180000, budgetSource: 'set', budgetUsed: 1.4, profit: 177500 }],
        totalSpent: 2500, totalBudget: 180000,
      }),
    ),
  },
  '/api/expenses/reasons': {
    get: op(
      'expenseListReasons',
      'Expenses',
      'List expense reasons',
      `${EXP_MOUNT} ${perm('expenses', 'view', 'Expenses \u203a View')}\n\nThe reason list the expense form shows: the organization\u2019s list (copied onto the branch for this request). When that list is empty, the platform defaults are returned: Transport of material, Labour charges, Material purchase, Structure fabrication, Electrical work, Permits & net-metering fees, Travel & site visit, Tools & equipment, Food & accommodation, Repair / rework. The body is an array of strings, not \`{ items }\`. Creating an expense does not require the reason to be one of these; they are suggestions.`,
      null,
      null,
      done(200, 'Array of reason strings.', { type: 'array', items: { type: 'string' } }, ['Transport of material', 'Labour charges', 'Material purchase']),
    ),
    put: op(
      'expenseUpdateReasons',
      'Expenses',
      'Replace expense reasons',
      `${EXP_MOUNT} Not an Expenses permission. Company admin, or the branch owner when the organization has no branches. Anyone else: 403 \`Only your company admin can change these settings.\`\n\nReplaces the shared reason list and returns the saved strings. Blanks dropped. Duplicates dropped case-insensitively (first spelling kept). Capped at 50. Each reason max 300. At least one non-blank, else 400 \`Add at least one expense reason\` (the schema says the same before that). The next \`GET\` on this branch sees this list.`,
      null,
      jsonBody('The full list. This is not a partial edit.', {
        type: 'object',
        required: ['reasons'],
        properties: { reasons: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', maxLength: 300 } } },
      }, { reasons: ['Labour charges', 'Transport of material', 'Material purchase'] }),
      done(200, 'The saved list, after blanks and duplicates are removed.', { type: 'array', items: { type: 'string' } }, ['Labour charges', 'Transport of material', 'Material purchase'], V),
    ),
  },
  '/api/expenses/analytics': {
    get: op(
      'expenseAnalytics',
      'Expenses',
      'Profit and loss across projects',
      `${EXP_MOUNT} ${perm('expenses', 'view', 'Expenses \u203a View')}\n\n\`months\` is \`6\`, \`12\`, or \`24\`. Anything else, including omitted, is 12. Months are UTC \`YYYY-MM\`, oldest first, ending this month.\n\n\`totals\` covers every project in the overview (not filtered by \`q\`), lifetime, not just the window. \`totals.budget\`, \`totals.spentAgainstBudget\`, \`totals.profit\`, and \`totals.overBudget\` use only projects that have a budget. \`totals.spent\` is every project. \`totals.profit\` sums each budgeted project\u2019s budget \u2212 spent. \`monthly\` is spend in the window by \`spentOn\`. \`byReason\` is the top 7 reasons in that window; the rest fold into \`{ reason: "Other", other: true }\` when there is a rest. \`projects\` is the same row shape as the overview, uncapped by search, still at most 1000.`,
      [q('months', { type: 'integer', enum: [6, 12, 24], default: 12 }, 'Window length. Any other value becomes 12.')],
      null,
      done(200, 'Totals, per project, monthly spend, and spend by reason.', {
        type: 'object',
        properties: {
          months: { type: 'integer', enum: [6, 12, 24] },
          totals: { type: 'object', properties: { projects: { type: 'integer' }, budgeted: { type: 'integer' }, budget: money, spent: money, spentAgainstBudget: money, profit: money, overBudget: { type: 'integer', description: 'Budgeted projects whose profit is negative.' } } },
          projects: { type: 'array', items: projectMoney },
          monthly: { type: 'array', items: { type: 'object', properties: { month: str('`YYYY-MM`.', '2026-11'), spent: money } } },
          byReason: { type: 'array', items: { type: 'object', properties: { reason: { type: 'string' }, amount: money, count: { type: 'integer' }, other: { type: 'boolean', description: 'Present and true only on the folded Other row.' } } } },
        },
      }, {
        months: 12,
        totals: { projects: 1, budgeted: 1, budget: 180000, spent: 2500, spentAgainstBudget: 2500, profit: 177500, overBudget: 0 },
        projects: [],
        monthly: [{ month: '2026-11', spent: 2500 }],
        byReason: [{ reason: 'Labour charges', amount: 2500, count: 1 }],
      }),
    ),
  },
  '/api/expenses/design/{designId}': {
    get: op(
      'expenseListForDesign',
      'Expenses',
      'Expenses, budget, and profit for one proposal',
      `${EXP_MOUNT} ${perm('expenses', 'view', 'Expenses \u203a View')}\n\nAny proposal, not only Booked. Expenses newest \`spentOn\` first. \`total\` is the sum of \`items[].amount\` (what was spent), not the quote. \`design.amount\` is the quote (\`summary.pricing.total\`, else \`summary.cost\`). \`budget\` is the saved budget (\`source\` \`set\`) or, for a Booked proposal with a quote above 0, \`{ amount: quote, note: "", updatedByName: "", updatedAt: null, source: "proposal" }\`, else null. \`budgetUsed\` and \`profit\` use that budget the same way as the overview. Unknown proposal: 404 \`Proposal not found\`.`,
      [pathId('designId', 'Proposal id.')],
      null,
      done(200, 'The proposal, its expenses, and the budget in force.', {
        type: 'object',
        properties: {
          design: { type: 'object', properties: { id: oid, name: { type: 'string' }, status: { type: 'string' }, client: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' } } }, amount: { ...money, description: 'Quoted price, not the spend.' } } },
          items: { type: 'array', items: expenseSchema },
          total: { ...money, description: 'Sum of expense amounts.' },
          budget: { nullable: true, allOf: [budgetSchema] },
          budgetUsed: { type: 'number', nullable: true },
          profit: { ...money, nullable: true, description: 'Budget minus `total`. Negative is a loss.' },
        },
      }, {
        design: { id: '665f1c2a3b4d5e6f7a8b9c02', name: '12 kW rooftop \u2014 Sharma', status: 'won', client: { id: '665f1c2a3b4d5e6f7a8b9c03', name: 'Sharma' }, amount: 250000 },
        items: [expenseExample], total: 2500,
        budget: { amount: 180000, note: 'Site budget', updatedByName: 'Anita', updatedAt: '2026-11-21T00:00:00.000Z', source: 'set' },
        budgetUsed: 1.4, profit: 177500,
      }, N),
    ),
    post: op(
      'expenseCreate',
      'Expenses',
      'Add an expense to a proposal',
      `${EXP_MOUNT} ${perm('expenses', 'create', 'Expenses \u203a Add expenses')}\n\nRecords money spent on this proposal. It does not change billing, stock, or the quote. \`amount\` is the cost (0.01 to 10000000000). \`reason\` is required, max 300, and does not have to be one of the suggestion list. \`note\` optional, max 500. \`spentOn\` is an ISO date; omitted, null, or "" means now. Unparseable: 400 \`Enter a valid date\`. \`createdByName\` is the signed-in user. Unknown proposal: 404 \`Proposal not found\`.`,
      [pathId('designId', 'Proposal id.')],
      jsonBody('Amount and reason. Date defaults to now.', {
        type: 'object',
        required: ['amount', 'reason'],
        properties: {
          amount: { type: 'number', minimum: 0.01, maximum: 1e10 },
          reason: str('Required. Max 300.', 'Labour charges'),
          note: str('Optional. Max 500.', 'Site wiring'),
          spentOn: str('ISO 8601. Omitted or blank: now.'),
        },
      }, { amount: 2500, reason: 'Labour charges', note: 'Site wiring', spentOn: '2026-11-22T00:00:00.000Z' }),
      done(201, 'The expense. No bill attached yet (`billUrl` empty, `billSize` 0).', expenseSchema, expenseExample, { ...V, ...N }),
    ),
  },
  '/api/expenses/design/{designId}/budget': {
    put: op(
      'expenseSetBudget',
      'Expenses',
      'Set a project budget',
      `${EXP_MOUNT} ${perm('expenses', 'update', 'Expenses \u203a Edit expenses')}\n\nCreates or replaces the one budget for this proposal. After this, overview \`budgetSource\` is \`set\` and the Booked price is no longer the budget. \`amount\` is 0.01 to 10000000000. \`note\` optional, max 300; omitted stores "". \`updatedByName\` is the signed-in user. \`source\` in the response is \`set\`. This does not change expenses already recorded. \`profit\` on the next read is this amount minus spend. Unknown proposal: 404 \`Proposal not found\`.`,
      [pathId('designId', 'Proposal id.')],
      jsonBody('The budget amount. Replaces any budget already saved.', {
        type: 'object',
        required: ['amount'],
        properties: { amount: { type: 'number', minimum: 0.01, maximum: 1e10 }, note: str('Max 300.') },
      }, { amount: 180000, note: 'Site budget' }),
      done(200, 'The saved budget. `updatedAt` is ISO.', budgetSchema, { amount: 180000, note: 'Site budget', updatedByName: 'Anita', updatedAt: '2026-11-21T00:00:00.000Z', source: 'set' }, { ...V, ...N }),
    ),
    delete: op(
      'expenseRemoveBudget',
      'Expenses',
      'Remove a saved project budget',
      `${EXP_MOUNT} ${perm('expenses', 'update', 'Expenses \u203a Edit expenses')}\n\nDeletes the saved budget. Expenses stay. A Booked proposal with a quote above 0 falls back to that quote (\`budgetSource\` \`proposal\`) on the next read. If there was no saved budget, the response is still \`{ ok: true }\` as long as the proposal exists. Unknown proposal: 404 \`Proposal not found\`.`,
      [pathId('designId', 'Proposal id.')],
      null,
      done(200, 'Removed, or there was nothing to remove.', okSchema, { ok: true }, N),
    ),
  },
  '/api/expenses/{id}/bill': {
    post: op(
      'expenseAttachBill',
      'Expenses',
      'Attach a vendor bill to an expense',
      `${EXP_MOUNT} ${perm('expenses', 'update', 'Expenses \u203a Edit expenses')}\n\nMultipart field \`file\`, one file, 20 MB. The original name must end in pdf, png, jpg, jpeg, webp, xlsx, or xls, else 400 \`Upload a PDF, a PNG / JPG / WebP image or an Excel file (XLSX, XLS)\`. The bytes must be a real PDF, PNG, JPG, WebP, XLSX, or XLS, else 400 \`That file is not a valid PDF, PNG, JPG, WebP image or Excel file\`. Over 20 MB: 400 \`That file is too large\`. No file: 400 \`Choose the bill to upload (PDF, image or Excel)\`. Same upload rate limit as other files.\n\nA previous file is replaced and deleted. The response is the expense, not the file. \`billUrl\` is \`/uploads/{stored name}\`, \`billName\` is the original name (max 200), \`billSize\` is the size in bytes. Unknown expense: 404 \`Expense not found\`.`,
      [pathId('id', 'Expense id.')],
      fileBody('PDF, PNG, JPG, WebP, XLSX, or XLS. Field name `file`. Up to 20 MB.'),
      done(201, 'The expense with the bill attached.', expenseSchema, { ...expenseExample, billUrl: '/uploads/665f1c2a3b4d5e6f7a8b9c01-expbill-665f1c2a3b4d5e6f7a8b9c20-ab12cd34.pdf', billName: 'labour.pdf', billSize: 120034 }, { ...N, ...C }),
    ),
    delete: op(
      'expenseRemoveBill',
      'Expenses',
      'Remove an expense\u2019s vendor bill',
      `${EXP_MOUNT} ${perm('expenses', 'update', 'Expenses \u203a Edit expenses')}\n\nDeletes the file and clears \`billUrl\`, \`billName\`, and \`billSize\`. The expense row stays. The response is \`{ ok: true }\` even when there was no file (not the expense). Unknown expense: 404 \`Expense not found\`.`,
      [pathId('id', 'Expense id.')],
      null,
      done(200, 'The file is cleared.', okSchema, { ok: true }, N),
    ),
  },
  '/api/expenses/{id}': {
    put: op(
      'expenseUpdate',
      'Expenses',
      'Update an expense',
      `${EXP_MOUNT} ${perm('expenses', 'update', 'Expenses \u203a Edit expenses')}\n\nPartial: omit a key to leave it. \`amount\`, when sent, is 0.01 to 10000000000. \`reason\`, when sent, is required and max 300 (blank fails validation \`Reason is required\`). \`note\`, when sent, replaces the note; "" clears it (max 500). \`spentOn\`, when sent, is parsed as a date: a real ISO string sets it, and null or "" sets it to now (it does not mean \u201cleave it\u201d). Unparseable: 400 \`Enter a valid date\`. The bill file is not changed here. Unknown expense: 404 \`Expense not found\`.`,
      [pathId('id', 'Expense id.')],
      jsonBody('Any subset of amount, reason, note, spentOn.', {
        type: 'object',
        properties: {
          amount: { type: 'number', minimum: 0.01, maximum: 1e10 },
          reason: str('Max 300. Blank is rejected when the key is sent.'),
          note: str('Max 500. Empty string clears it.'),
          spentOn: str('ISO 8601. Null or "" means now, not "unchanged".'),
        },
      }, { amount: 2800, note: 'Including conduit' }),
      done(200, 'The expense.', expenseSchema, { ...expenseExample, amount: 2800, note: 'Including conduit' }, { ...V, ...N }),
    ),
    delete: op(
      'expenseDelete',
      'Expenses',
      'Delete an expense',
      `${EXP_MOUNT} ${perm('expenses', 'delete', 'Expenses \u203a Delete expenses')}\n\nDeletes the row and its vendor-bill file. Spend on the proposal drops by this amount on the next read. Unknown: 404 \`Expense not found\`.`,
      [pathId('id', 'Expense id.')],
      null,
      done(200, 'Deleted.', okSchema, { ok: true }, N),
    ),
  },
});

export default billing;
