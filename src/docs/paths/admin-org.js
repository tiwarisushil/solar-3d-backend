// Admin, organization, and company HTTP paths. Success JSON is the value itself (no { data } wrapper).
const bearer = [{ bearerAuth: [] }];

const Unauthorized = { $ref: '#/components/responses/Unauthorized' };
const Forbidden = { $ref: '#/components/responses/Forbidden' };
const NotFound = { $ref: '#/components/responses/NotFound' };
const Conflict = { $ref: '#/components/responses/Conflict' };
const ValidationError = { $ref: '#/components/responses/ValidationError' };
const RateLimited = { $ref: '#/components/responses/RateLimited' };
const ServerError = { $ref: '#/components/responses/ServerError' };
const ObjectId = { $ref: '#/components/schemas/ObjectId' };

const auth = { '401': Unauthorized, '403': Forbidden, '500': ServerError };
const authValidated = { '400': ValidationError, ...auth };
const authFound = { '404': NotFound, ...auth };
const authValidatedFound = { '400': ValidationError, '404': NotFound, ...auth };

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'MongoDB id of the record (24 hex characters). An id that is not valid hex is 404, not 400.',
  schema: ObjectId,
};

const kindParam = {
  name: 'kind',
  in: 'path',
  required: true,
  description: 'Which branding image. `logo` is the company logo. `signature` is the e-signature. `qr` is the website / proposal QR. `paymentQr` is the UPI payment QR. Anything else is 400 `Unknown asset`, and no file is stored.',
  schema: { type: 'string', enum: ['logo', 'signature', 'qr', 'paymentQr'] },
};

const pageQuery = (def, max) => ({
  name: 'page',
  in: 'query',
  required: false,
  description: `1-based page. Missing, 0, or not a number becomes 1. There is no error for a page past the end: \`items\` is empty and \`total\` is the real count.`,
  schema: { type: 'integer', minimum: 1, default: 1 },
});

const limitQuery = (def, max) => ({
  name: 'limit',
  in: 'query',
  required: false,
  description: `Page size. Default ${def}. Values below 1 become ${def}. Values above ${max} are clamped to ${max}.`,
  schema: { type: 'integer', minimum: 1, maximum: max, default: def },
});

const ok = (description, schema, example) => ({
  description,
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } },
});

const messageSchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: { type: 'string', description: 'Text safe to show. These integration handlers use `message`, not the shared `error` field.' },
    code: { type: 'string', description: 'Set on a few Meta failures (META_RECONNECT_REQUIRED, META_PERMISSION_DENIED, META_RATE_LIMITED, META_NOT_AVAILABLE, META_UNAVAILABLE).' },
  },
};

const msg = (description, example) => ({
  description,
  content: { 'application/json': { schema: messageSchema, example } },
});

const iso = { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp.' };
const hexColor = { type: 'string', description: 'Colour as #rrggbb, for example #1d4ed8.', example: '#1d4ed8' };

const limitsShape = {
  type: 'object',
  description: 'Whole numbers, each at least 1. Nothing is unlimited.',
  properties: {
    maxConcurrentLogins: { type: 'integer', minimum: 1, maximum: 1000, description: 'Devices signed in at once, for each branch\'s owners and separately for the company admin\'s own devices. The same number applies to every branch; it is not split between branches.' },
    maxBranches: { type: 'integer', minimum: 1, maximum: 500, description: 'How many branches the company may have. A company without branches stays at 1.' },
    maxClients: { type: 'integer', minimum: 1, description: 'Clients counted across every branch together.' },
    maxDesigns: { type: 'integer', minimum: 1, description: 'Designs (proposals) counted across every branch together.' },
  },
};

const planSummary = {
  type: 'object',
  nullable: true,
  description: 'Short plan card. Null when the company has no plan.',
  properties: {
    id: ObjectId,
    code: { type: 'string', description: 'Stable code, stored lower case, at most 40 characters. Built-in codes include basic, pro, and custom.' },
    name: { type: 'string' },
    description: { type: 'string' },
    kind: { type: 'string', enum: ['fixed', 'custom'], description: '`fixed` is a preset the company can request. `custom` is a plan the platform admin built for one company.' },
    priceMonthly: { type: 'number', description: 'Monthly price in INR. Custom plans may be 0 here when the kind forces it.' },
    maxConcurrentLogins: { type: 'integer' },
    maxBranches: { type: 'integer' },
    maxClients: { type: 'integer' },
    maxDesigns: { type: 'integer' },
    features: { type: 'array', items: { type: 'string' }, description: 'Up to 20 lines, each at most 100 characters, shown on the plan card.' },
    selfServe: { type: 'boolean', description: 'The company may request this plan itself. Always false on a custom plan.' },
    active: { type: 'boolean', description: 'Inactive plans are hidden from companies.' },
  },
};

const planDocument = {
  type: 'object',
  description: 'A plan row. `id` is the string to send as planId.',
  properties: {
    ...planSummary.properties,
    sortOrder: { type: 'number', description: 'List order. Lower comes first.' },
    forCompany: { ...ObjectId, nullable: true, description: 'Set on a custom plan created for one company. Null on shared plans.' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const featuresShape = {
  type: 'object',
  properties: {
    pdfBranding: { type: 'boolean', description: 'Logo, colours, signature, and QR on the proposal PDF.' },
    excelImport: { type: 'boolean', description: 'Whether this company may import spreadsheets.' },
  },
};

const subscriptionShape = {
  type: 'object',
  properties: {
    periodStart: { ...iso, nullable: true },
    periodEnd: { ...iso, nullable: true },
    status: { type: 'string', enum: ['none', 'active', 'cancelled'] },
    billingCycle: { type: 'string', description: 'Stored cycle. The app prices a 30-day month.', example: 'monthly' },
    cancelAtPeriodEnd: { type: 'boolean' },
  },
};

const quoteShape = {
  type: 'object',
  description: 'Prorated upgrade inside the current 30-day period. Amounts are INR, rounded to paise.',
  properties: {
    dueNow: { type: 'number', description: 'What to collect now. Never negative.' },
    credit: { type: 'number', description: 'Unused value of the current plan for the days left.' },
    newCost: { type: 'number', description: 'Cost of the new plan for the days left.' },
    daysRemaining: { type: 'integer' },
    nextRenewalAmount: { type: 'number', description: 'The new plan’s full monthly price at the next renewal.' },
    fullPeriod: { type: 'boolean', description: 'True when the current period has already ended, so dueNow is the full new price and credit is 0.' },
  },
};

const installationStep = {
  type: 'object',
  properties: {
    id: ObjectId,
    name: { type: 'string', description: 'Required. At most 80 characters.' },
    description: { type: 'string', description: 'At most 400 characters.' },
    role: { type: 'string', description: 'A job title from the company’s agent roles, or empty. Must match a title already on the company (case-insensitive).' },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Defaults to medium when omitted, null, or "".' },
  },
};

const namedStep = {
  type: 'object',
  properties: {
    id: ObjectId,
    name: { type: 'string', description: 'Required. At most 80 characters.' },
    description: { type: 'string', description: 'At most 400 characters. Omitted or blank is stored as "".' },
  },
};

const amcTemplate = {
  type: 'object',
  properties: {
    id: ObjectId,
    name: { type: 'string', description: 'Required. At most 80 characters.' },
    daysAfterInstallation: { type: 'integer', nullable: true, minimum: 1, maximum: 3650, description: 'Required when kind is mandatory. Null on an optional visit (the date is chosen when someone books it).' },
    kind: { type: 'string', enum: ['mandatory', 'optional'], description: 'Anything other than optional is stored as mandatory.' },
    price: { type: 'number', minimum: 0, description: '0 means a free visit. At most 1000000000.' },
    description: { type: 'string', description: 'Sanitised HTML, at most 30000 characters.' },
    criteria: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 200 }, description: 'Checklist lines. Blanks are dropped.' },
  },
};

const leadField = {
  type: 'object',
  required: ['key', 'label', 'type'],
  properties: {
    key: { type: 'string', description: 'Storage key. Send the key you got back to keep answers linked. A new field’s key is built from the label. Fixed keys name, phone, and address are not accepted as custom fields.' },
    label: { type: 'string', maxLength: 60, description: 'Shown on the form. Unique, and not Name, Phone, or Address.' },
    type: { type: 'string', enum: ['text', 'textarea', 'number', 'phone', 'email', 'select', 'multiselect', 'date', 'yesno'] },
    required: { type: 'boolean' },
    help: { type: 'string', maxLength: 200 },
    options: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 60 }, description: 'Required (1 to 50) for select and multiselect. Empty for every other type.' },
    fixed: { type: 'boolean', description: 'True only on the three fields every company has (name, phone, address). Present on the response, not sent on save.' },
  },
};

const companyProfileFields = {
  name: { type: 'string', maxLength: 120, description: 'Required on create. On a partial update, omit to leave it. Null or "" is rejected (the name cannot be cleared).' },
  email: { type: 'string', description: 'Optional. Blank or null clears it. Stored lower case. Example name@company.com.' },
  phone: { type: 'string', description: 'Optional. An Indian mobile is stored as 10 digits. Other countries keep a leading + and country code. Null or "" clears it.' },
  alternatePhone: { type: 'string', description: 'Same phone rules as phone. Null or "" clears it.' },
  address: { type: 'string', maxLength: 400, description: 'Null or "" clears it.' },
  website: { type: 'string', description: 'Optional. A host like www.example.com or a full http(s) URL. Null or "" clears it.' },
  taxId: { type: 'string', description: 'GSTIN (like 27ABCDE1234F1Z5) or another country’s tax number (4–20 letters and digits, at least two digits). Stored upper case. Null or "" clears it.' },
  pan: { type: 'string', description: 'PAN like ABCDE1234F. Stored upper case. Null or "" clears it.' },
};

const invoiceNumberingBody = {
  type: 'object',
  required: ['prefix', 'next'],
  description: 'Replace the branch’s invoice series. Omit the whole object to leave it. `next` is the next running number typed with its leading zeros ("0001"): the length of that string is the width (1 to 10). A number already issued under the same prefix is rejected.',
  properties: {
    prefix: { type: 'string', maxLength: 20, description: 'Letters, digits, and - / _ . only. May be "".' },
    next: { type: 'string', description: 'Digits only, 1 to 10 characters, value at least 1. Example "0001".' },
  },
};

const proposalNumberingBody = {
  type: 'object',
  required: ['prefix', 'suffix', 'next'],
  description: 'Replace the branch’s proposal series (prefix + padded number + suffix). Omit the whole object to leave it. Same reuse rule as invoices.',
  properties: {
    prefix: { type: 'string', maxLength: 20, description: 'Letters, digits, and - / _ . only. May be "".' },
    suffix: { type: 'string', maxLength: 20, description: 'Same character rules. "" means no suffix.' },
    next: { type: 'string', description: 'Digits only, like "0001".' },
  },
};

const bankFields = {
  bankAccountName: { type: 'string', maxLength: 120, description: 'Null or "" clears it.' },
  bankName: { type: 'string', maxLength: 120, description: 'Null or "" clears it.' },
  bankAccountNumber: { type: 'string', description: '6 to 20 digits, spaces stripped. Send "" to clear. Null is rejected.' },
  bankIfsc: { type: 'string', description: 'Like SBIN0001234, stored upper case. Send "" to clear. Null is rejected.' },
  bankBranch: { type: 'string', maxLength: 120, description: 'Null or "" clears it.' },
  bankAccountType: { type: 'string', maxLength: 40, description: 'Null or "" clears it.' },
  upiId: { type: 'string', description: 'Like name@bank. Send "" to clear. Null is rejected.' },
};

const themeBody = {
  type: 'object',
  description: 'Omit the object to leave both colours. Send only the colour you are changing.',
  properties: {
    primary: hexColor,
    accent: hexColor,
  },
};

const companySelfBody = {
  type: 'object',
  description: 'Partial. Omit a key to leave it unchanged. Extra keys are ignored. Null or "" clears a text field only where that field says so. This object is loose: theme, pdfTerms, productUnits, and agentRoles are not in the validator but the service saves them.',
  properties: {
    ...companyProfileFields,
    invoiceNumbering: invoiceNumberingBody,
    proposalNumbering: proposalNumberingBody,
    signatoryName: { type: 'string', maxLength: 120, description: 'Null or "" clears it.' },
    signatoryTitle: { type: 'string', maxLength: 80, description: 'Null or "" clears it.' },
    qrLabel: { type: 'string', maxLength: 80, description: 'Caption under the proposal QR. Null or "" clears it.' },
    paymentQrLabel: { type: 'string', maxLength: 80, description: 'Caption under the UPI QR. Null or "" clears it.' },
    ...bankFields,
    tagline: { type: 'string', maxLength: 160, description: 'Cover line on the PDF. Null or "" clears it.' },
    pdfTerms: { type: 'string', maxLength: 30000, description: 'Proposal terms as HTML. Sanitised before save. "" clears it. Not checked by the validator; the service still reads it.' },
    currency: { type: 'string', description: '3-letter code, stored upper case, like INR.', example: 'INR' },
    taxLabel: { type: 'string', maxLength: 20, description: 'Name of the tax on screens and PDFs, like GST. Null or "" clears it.' },
    taxRate: { type: 'number', minimum: 0, maximum: 100, description: 'Percent. Omit to leave it. Do not send null.' },
    tariff: { type: 'number', minimum: 0, maximum: 1000, description: 'Default electricity tariff. Omit to leave it.' },
    otherCostPerKw: { type: 'number', minimum: 0, maximum: 10000000, description: 'Balance-of-system cost per kW. Omit to leave it.' },
    theme: themeBody,
    productUnits: { type: 'array', maxItems: 60, items: { type: 'string', maxLength: 20 }, description: 'Catalog unit labels. The list replaces the old one. Blanks and repeats (any case) are dropped. At least one must remain, at most 60. First letter is capitalised. Omit the key to leave the list.' },
    agentRoles: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 40 }, description: 'Job titles used on installation steps. Same replace / de-dupe rules as product units. At least one, at most 30. Omit the key to leave the list.' },
  },
  example: {
    name: 'Helio Power — Andheri',
    phone: '9876543210',
    currency: 'INR',
    taxLabel: 'GST',
    taxRate: 18,
    theme: { primary: '#1d4ed8', accent: '#f59e0b' },
  },
};

const numberingOut = {
  type: 'object',
  properties: {
    prefix: { type: 'string' },
    suffix: { type: 'string', description: 'Proposal numbers only.' },
    width: { type: 'integer', description: 'How many digits the running number is padded to. Set by the length of `next` when you save, not sent as its own field.' },
    next: { type: 'integer', nullable: true, description: 'Next number that will be reserved. Null on a legacy company that has never set invoice numbering.' },
    nextInvoiceNo: { type: 'string', description: 'Invoice preview only, such as INV-0007. Nothing is reserved by reading it.' },
    nextProposalNo: { type: 'string', description: 'Proposal preview only, such as PRO-0007.' },
  },
};

const companyView = {
  type: 'object',
  description: 'The branch the token is working in, with shared masters (branding, steps, pricing, units, job titles, lead form, features) already copied from the organization. Platform-only fields (notes, plan, planRef, organization id) are not included.',
  properties: {
    id: ObjectId,
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    alternatePhone: { type: 'string' },
    address: { type: 'string' },
    website: { type: 'string' },
    taxId: { type: 'string' },
    pan: { type: 'string' },
    status: { type: 'string', enum: ['active', 'suspended'] },
    limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer', description: 'Devices this branch\'s owners may have signed in at once. Copy of the organization\'s sign-in limit; every branch has the same number.' } } },
    subscription: subscriptionShape,
    features: featuresShape,
    theme: { type: 'object', properties: { primary: hexColor, accent: hexColor } },
    logo: { type: 'string', description: 'Public path /uploads/… or "".' },
    signature: { type: 'string', description: 'Public path /uploads/… or "".' },
    qr: { type: 'string', description: 'Proposal / website QR path, or "".' },
    paymentQr: { type: 'string', description: 'UPI QR path, or "".' },
    signatoryName: { type: 'string' },
    signatoryTitle: { type: 'string' },
    qrLabel: { type: 'string' },
    paymentQrLabel: { type: 'string' },
    tagline: { type: 'string' },
    pdfTerms: { type: 'string', description: 'Sanitised HTML.' },
    bankAccountName: { type: 'string' },
    bankName: { type: 'string' },
    bankAccountNumber: { type: 'string' },
    bankIfsc: { type: 'string' },
    bankBranch: { type: 'string' },
    bankAccountType: { type: 'string' },
    upiId: { type: 'string' },
    installationSteps: { type: 'array', items: installationStep },
    amcTemplates: { type: 'array', items: amcTemplate },
    loanSteps: { type: 'array', items: namedStep },
    subsidySteps: { type: 'array', items: namedStep },
    expenseReasons: { type: 'array', items: { type: 'string' } },
    currency: { type: 'string' },
    taxLabel: { type: 'string' },
    taxRate: { type: 'number' },
    tariff: { type: 'number' },
    otherCostPerKw: { type: 'number' },
    productUnits: { type: 'array', items: { type: 'string' } },
    agentRoles: { type: 'array', items: { type: 'string' } },
    leadForm: { type: 'array', items: leadField, description: 'Custom fields only (the three fixed fields are not stored here).' },
    invoiceNumbering: numberingOut,
    proposalNumbering: numberingOut,
    billing: {
      type: 'object',
      description: 'Same numbers as GET /api/company/subscription.',
      properties: {
        plan: planSummary,
        limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer' } }, description: 'Sign-in limit enforced at login for this branch\'s owners (the organization\'s number; the same for every branch and for the company admin).' },
        companyLimits: { type: 'object', properties: { maxBranches: { type: 'integer' }, maxClients: { type: 'integer', nullable: true }, maxDesigns: { type: 'integer', nullable: true } } },
        subscription: {
          type: 'object',
          properties: {
            periodStart: { ...iso, nullable: true },
            periodEnd: { ...iso, nullable: true },
            daysRemaining: { type: 'integer', nullable: true },
            status: { type: 'string', enum: ['none', 'active', 'cancelled'] },
            billingCycle: { type: 'string' },
            cancelAtPeriodEnd: { type: 'boolean' },
          },
        },
        renewal: {
          type: 'object',
          properties: {
            nextAmount: { type: 'number', description: 'The plan’s monthly price, or 0 when there is no plan.' },
            nextDate: { ...iso, nullable: true },
            daysRemaining: { type: 'integer', nullable: true },
            billingCycle: { type: 'string' },
            cancelAtPeriodEnd: { type: 'boolean' },
          },
        },
      },
    },
    createdAt: iso,
    updatedAt: iso,
  },
};

const organizationDoc = {
  type: 'object',
  description: 'The organization document. Shared masters live here. `id` is the organization id, not a branch id.',
  properties: {
    id: ObjectId,
    role: { type: 'string', enum: ['organization'], description: 'Added only by GET /api/organization and by the asset routes. PUT responses do not add it.' },
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    status: { type: 'string', enum: ['active', 'suspended'] },
    hasBranches: { type: 'boolean', description: 'Chosen when the platform admin created the company. It cannot be changed.' },
    branchVersion: { type: 'integer', description: 'Internal counter bumped when a branch is created. Do not display it.' },
    plan: { type: 'string', description: 'Legacy plan label. Read planRef for the real plan.' },
    planRef: { ...ObjectId, nullable: true },
    limits: limitsShape,
    capsMigrated: { type: 'boolean', description: 'Internal. Ignore it.' },
    loginLimitMigrated: { type: 'boolean', description: 'Internal. Ignore it.' },
    subscription: subscriptionShape,
    features: featuresShape,
    notes: { type: 'string', description: 'Platform admin notes. The company settings screen does not edit these.' },
    theme: { type: 'object', properties: { primary: hexColor, accent: hexColor } },
    logo: { type: 'string' },
    signature: { type: 'string' },
    qr: { type: 'string' },
    paymentQr: { type: 'string' },
    signatoryName: { type: 'string' },
    signatoryTitle: { type: 'string' },
    qrLabel: { type: 'string' },
    paymentQrLabel: { type: 'string' },
    tagline: { type: 'string' },
    pdfTerms: { type: 'string' },
    bankAccountName: { type: 'string' },
    bankName: { type: 'string' },
    bankAccountNumber: { type: 'string' },
    bankIfsc: { type: 'string' },
    bankBranch: { type: 'string' },
    bankAccountType: { type: 'string' },
    upiId: { type: 'string' },
    invoiceNumbering: numberingOut,
    installationSteps: { type: 'array', items: installationStep },
    amcTemplates: { type: 'array', items: amcTemplate },
    loanSteps: { type: 'array', items: namedStep },
    subsidySteps: { type: 'array', items: namedStep },
    expenseReasons: { type: 'array', items: { type: 'string' } },
    currency: { type: 'string' },
    taxLabel: { type: 'string' },
    taxRate: { type: 'number' },
    tariff: { type: 'number' },
    otherCostPerKw: { type: 'number' },
    productUnits: { type: 'array', items: { type: 'string' } },
    agentRoles: { type: 'array', items: { type: 'string' } },
    leadForm: { type: 'array', items: leadField, description: 'Custom fields only.' },
    parentCategoriesSeeded: { type: 'boolean', description: 'Internal. Ignore it.' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const adminCompany = {
  type: 'object',
  description: 'One branch (the platform’s “company” row) plus login and usage. Password hashes are never included.',
  properties: {
    ...companyView.properties,
    organization: { ...ObjectId, nullable: true, description: 'Organization id.' },
    organizationName: { type: 'string' },
    hasBranches: { type: 'boolean' },
    notes: { type: 'string', description: 'Private notes for the platform admin.' },
    plan: { type: 'string', description: 'Plan code (or the legacy label when no plan row is linked).' },
    planRef: { ...ObjectId, nullable: true },
    planId: { type: 'string', description: 'Same id as planRef, or "" when none. Send this back as planId to keep or change the plan.' },
    planDetail: planSummary,
    maxBranches: { type: 'integer', description: 'Organization cap, not the branch’s own limit.' },
    maxClients: { type: 'integer', nullable: true },
    maxDesigns: { type: 'integer', nullable: true },
    poolLogins: { type: 'integer', nullable: true, description: 'The company\'s sign-in limit (organization.limits.maxConcurrentLogins). Each branch\'s owners and the company admin may each have this many devices signed in; it is not split between branches.' },
    adminEmail: { type: 'string', description: 'Company admin sign-in (role company). "" when the company was set up without branches.' },
    loginEmail: { type: 'string', description: 'This branch owner’s sign-in (role branch).' },
    contactName: { type: 'string', description: 'Branch owner’s name.' },
    lastLoginAt: { ...iso, nullable: true, description: 'Branch owner’s last sign-in.' },
    counts: {
      type: 'object',
      properties: {
        clients: { type: 'integer' },
        designs: { type: 'integer' },
        panels: { type: 'integer', description: 'Catalog products of type panels on this branch.' },
      },
    },
  },
};

const requestedLimits = {
  type: 'object',
  properties: {
    maxConcurrentLogins: { type: 'integer', minimum: 1 },
    maxBranches: { type: 'integer', minimum: 1 },
    maxClients: { type: 'integer', minimum: 1 },
    maxDesigns: { type: 'integer', minimum: 1 },
  },
};

const planRequest = {
  type: 'object',
  properties: {
    id: ObjectId,
    company: { description: 'On the company screen this is the branch id string. On the admin list it is the populated company `{ id, name, email }` because the query populates it.', nullable: true },
    companyName: { type: 'string' },
    type: { type: 'string', enum: ['preset', 'custom'] },
    plan: { description: 'Preset plan id string on the company screen. On the admin list, the populated plan document, or null.' },
    requestedPlan: planSummary,
    status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
    message: { type: 'string' },
    requestedLimits: requestedLimits,
    adminNotes: { type: 'string', description: 'Empty until an admin writes a note.' },
    planName: { type: 'string', description: 'Filled when the request is approved.' },
    quotedPriceMonthly: { type: 'number', description: '0 until approval. After approval, the monthly price that was applied.' },
    quotedLimits: requestedLimits,
    dedicatedPlan: { ...ObjectId, nullable: true, description: 'Custom plan created at approval. Null for a preset and before approval.' },
    decidedBy: { ...ObjectId, nullable: true },
    decidedAt: { ...iso, nullable: true },
    createdAt: iso,
    updatedAt: iso,
  },
};

const userView = {
  type: 'object',
  description: 'The user the new token belongs to. passwordHash is never included.',
  properties: {
    id: ObjectId,
    email: { type: 'string' },
    role: { type: 'string', enum: ['company', 'branch'], description: '`company` is the company admin. `branch` is the branch owner.' },
    name: { type: 'string' },
    company: { ...ObjectId, nullable: true, description: 'Branch id this login last worked in.' },
    organization: { ...ObjectId, nullable: true },
    phone: { type: 'string' },
    active: { type: 'boolean' },
    lastLoginAt: { ...iso, nullable: true },
    managesMasters: { type: 'boolean', description: 'True for a company admin, and for a branch owner when the organization has no branches.' },
    editsCatalog: { type: 'boolean', description: 'True for a company admin, and for a branch owner when the organization has no branches.' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const sessionOrganization = {
  type: 'object',
  nullable: true,
  description: 'A short organization card for the session, not the full settings document.',
  properties: {
    id: ObjectId,
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    status: { type: 'string', enum: ['active', 'suspended'] },
    limits: limitsShape,
    subscription: subscriptionShape,
    features: featuresShape,
    theme: { type: 'object', properties: { primary: hexColor, accent: hexColor } },
    logo: { type: 'string' },
    hasBranches: { type: 'boolean' },
  },
};

const impersonationResponse = {
  type: 'object',
  required: ['token', 'impersonated'],
  properties: {
    token: { type: 'string', description: 'Bearer token for the target user (branch owner or company admin). Send it on later calls to use the app as them. This call does not revoke the super admin token you already hold: keep that token and send it again to return to the admin console. The impersonation session is registered on the super admin; if that session is ended, this token answers 401 "This admin session has ended." or "This admin session is no longer valid."' },
    user: userView,
    company: companyView,
    organization: sessionOrganization,
    impersonated: { type: 'boolean', enum: [true], description: 'Always true. Show an impersonation banner.' },
  },
};

const okTrue = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } };

const freeProposalData = {
  type: 'object',
  description: 'What the visitor typed on the public proposal maker.',
  properties: {
    company: { type: 'object', properties: { name: { type: 'string' }, contactName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' }, taxId: { type: 'string' }, website: { type: 'string' } } },
    client: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' } } },
    system: { type: 'object', properties: { title: { type: 'string' }, type: { type: 'string' }, kw: { type: 'number' }, panelCount: { type: 'number' }, panelBrand: { type: 'string' }, panelWatts: { type: 'number' }, inverter: { type: 'string' }, structure: { type: 'string' }, warranty: { type: 'string' }, annualKwh: { type: 'number' }, tariff: { type: 'number' } } },
    items: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: ['product', 'service'] }, name: { type: 'string' }, description: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, rate: { type: 'number' }, taxPercent: { type: 'number' } } } },
    pricing: { type: 'object', properties: { currency: { type: 'string' }, discount: { type: 'number' }, discountIsPercent: { type: 'boolean' }, discountRemark: { type: 'string' }, taxType: { type: 'string', enum: ['None', 'GST', 'VAT', 'Sales tax', 'Service tax', 'SST', 'HST', 'Other'] }, taxPercent: { type: 'number' }, subsidy: { type: 'number' } } },
    terms: { type: 'object', properties: { validUntil: { type: 'string', description: 'YYYY-MM-DD or "".' }, payment: { type: 'string' }, conditions: { type: 'string' }, notes: { type: 'string' } } },
    design: { type: 'object', properties: { cover: { type: 'string', enum: ['magazine', 'photo', 'panel', 'minimal'] }, primary: hexColor, accent: hexColor } },
  },
};

const freeProposal = {
  type: 'object',
  properties: {
    id: ObjectId,
    refNo: { type: 'string', description: 'Printed reference, like FP-261111-9F2C.', example: 'FP-261111-9F2C' },
    token: { type: 'string', description: 'The visitor’s private link token. Do not publish it.' },
    companyName: { type: 'string' },
    contactName: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string' },
    clientName: { type: 'string' },
    data: freeProposalData,
    logo: { type: 'string', description: 'Data-URL image. Omitted from the list and from PATCH (those responses select it away). Present on GET one, or "".' },
    totals: { type: 'object', nullable: true, properties: { subtotal: { type: 'number' }, discountAmount: { type: 'number' }, taxable: { type: 'number' }, tax: { type: 'number' }, total: { type: 'number' }, subsidy: { type: 'number' }, net: { type: 'number' } } },
    downloads: { type: 'integer' },
    device: { type: 'object', properties: { userAgent: { type: 'string' }, browser: { type: 'string' }, os: { type: 'string' }, type: { type: 'string', description: 'mobile, tablet, desktop, or "".' }, screen: { type: 'string' }, language: { type: 'string' }, platform: { type: 'string' } } },
    location: { type: 'object', properties: { ip: { type: 'string' }, timezone: { type: 'string' }, lat: { type: 'number', nullable: true }, lng: { type: 'number', nullable: true }, accuracyM: { type: 'number', nullable: true } } },
    referrer: { type: 'string' },
    status: { type: 'string', enum: ['new', 'contacted', 'converted', 'closed'] },
    adminNotes: { type: 'string' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const contactMessage = {
  type: 'object',
  properties: {
    id: ObjectId,
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    company: { type: 'string', description: 'Company name the visitor typed. Not a company id.' },
    message: { type: 'string' },
    status: { type: 'string', enum: ['new', 'contacted', 'closed'] },
    adminNotes: { type: 'string' },
    ip: { type: 'string' },
    userAgent: { type: 'string' },
    referrer: { type: 'string' },
    createdAt: iso,
    updatedAt: iso,
  },
};

const paged = (item) => ({
  type: 'object',
  required: ['items', 'total', 'page', 'limit'],
  properties: {
    items: { type: 'array', items: item },
    total: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
  },
});

const stageCell = { type: 'object', properties: { count: { type: 'integer' }, value: { type: 'number', description: 'Money in the company currency.' }, kwp: { type: 'number' } } };
const stages = {
  type: 'object',
  description: 'Proposal pipeline. Keys are the design statuses.',
  properties: { draft: stageCell, proposed: stageCell, reproposed: stageCell, negotiation: stageCell, won: stageCell, lost: stageCell },
};
const monthPoint = { type: 'object', properties: { key: { type: 'string', example: '2026-11' }, label: { type: 'string', example: 'Nov 2026' }, amount: { type: 'number' }, count: { type: 'integer' } } };
const activityPoint = { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, created: { type: 'integer' }, won: { type: 'integer' } } };
const moneyBlock = { type: 'object', properties: { quoted: { type: 'number' }, billed: { type: 'number' }, yetToBill: { type: 'number' }, billedPct: { type: 'integer', description: '0 to 100.' } } };
const inventoryBlock = { type: 'object', properties: { products: { type: 'integer' }, value: { type: 'number' }, low: { type: 'integer' }, outOfStock: { type: 'integer' }, needsReorder: { type: 'integer', description: 'low + outOfStock.' } } };
const branchCounts = {
  type: 'object',
  properties: {
    clients: { type: 'integer' },
    designs: { type: 'integer' },
    staff: { type: 'integer', description: 'Active staff (role agent) on this branch.' },
    leads: { type: 'integer', description: 'Meta + Google + manual, not deleted.' },
    metaLeads: { type: 'integer' },
    googleLeads: { type: 'integer' },
    manualLeads: { type: 'integer' },
    leadsUnassigned: { type: 'integer' },
    leadsConverted: { type: 'integer' },
    leadsThisMonth: { type: 'integer' },
    leadsLastMonth: { type: 'integer' },
    installationsActive: { type: 'integer' },
    installationsCompleted: { type: 'integer' },
    amcInstallationsPending: { type: 'integer', description: 'Completed installations that still have a pending AMC visit.' },
    clientSupportOpen: { type: 'integer' },
    platformTicketsOpen: { type: 'integer' },
    loansOpen: { type: 'integer' },
    subsidiesOpen: { type: 'integer' },
    billingQueue: { type: 'integer', description: 'Parties with money still due, plus open bills.' },
    proposalsOpen: { type: 'integer', description: 'Status proposed, reproposed, or negotiation.' },
    proposalsWon: { type: 'integer' },
    revenueTotal: { type: 'number' },
    revenueThisMonth: { type: 'number' },
  },
};
const insights = {
  type: 'object',
  nullable: true,
  description: 'Sales and money. Null when the company has no branches. `revenue` is the last 12 calendar months, oldest first. `activity` is the last 6. `averageDeal` is only on the combined `insights`, not on each branch.',
  properties: {
    stages,
    winRate: { type: 'integer', nullable: true, description: 'Won ÷ (won + lost), as a percent. Null when nothing is decided.' },
    decided: { type: 'integer' },
    pipelineValue: { type: 'number' },
    pipelineCount: { type: 'integer' },
    bookedValue: { type: 'number' },
    bookedCount: { type: 'integer' },
    bookedKwp: { type: 'number' },
    averageDeal: { type: 'number', description: 'Combined insights only.' },
    money: moneyBlock,
    revenue: { type: 'array', items: monthPoint },
    activity: { type: 'array', items: activityPoint },
    thisMonth: { type: 'number' },
    lastMonth: { type: 'number' },
  },
};

const leadStatus = {
  type: 'object',
  description: 'A pipeline column. The id is `_id` (a hex string), not `id`.',
  properties: {
    _id: ObjectId,
    name: { type: 'string', maxLength: 40 },
    color: { type: 'string', enum: ['slate', 'blue', 'amber', 'emerald', 'rose', 'purple', 'cyan'] },
    order: { type: 'integer', description: 'Lower comes first.' },
    outcome: { type: 'string', enum: ['open', 'converted', 'lost'], description: 'Every company has exactly one converted and one lost status.' },
    isConversion: { type: 'boolean', description: 'True when outcome is converted.' },
    requiresDate: { type: 'boolean', description: 'Choosing this status on a lead asks for a date.' },
    isActive: { type: 'boolean', description: 'Inactive statuses stay on old leads but cannot be chosen.' },
  },
};

const metaSetup = {
  type: 'object',
  description: 'Values the admin copies into the Meta app. The App Secret is never returned. Page access tokens are never returned.',
  properties: {
    source: { type: 'string', nullable: true, enum: ['company', 'env', null], description: '`company` means the App ID was saved on this screen. `env` means the server environment fixes the app and this screen cannot change it. null means it is not set up.' },
    appId: { type: 'string', description: 'Meta App ID. Safe to show to the signed-in admin. Empty when nothing is configured.' },
    redirectUri: { type: 'string', description: 'OAuth redirect the Meta app must allow. This is the public callback, not a URL the frontend calls.' },
    webhookCallbackUrl: { type: 'string', description: 'Lead webhook URL to register on the Meta app. Empty when the redirect URI has no API base.' },
    webhookVerifyToken: { type: 'string', description: 'Verify token to paste into the Meta app. Empty when the token comes from the server environment (it is then hidden). When it is non-empty it is a secret: show it only on this settings screen, never on a public page.' },
    webhookRegistered: { type: 'boolean', description: 'True when this CRM registered the lead webhook with Meta for a company-owned app.' },
  },
};

const metaSyncJob = {
  type: 'object',
  nullable: true,
  properties: {
    id: ObjectId,
    status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
    trigger: { type: 'string', enum: ['manual', 'scheduled'] },
    since: { ...iso, nullable: true, description: 'Only leads after this moment were read. Null means every lead Meta still keeps (about 90 days).' },
    pageName: { type: 'string' },
    totalForms: { type: 'integer' },
    formsProcessed: { type: 'integer' },
    formsFailed: { type: 'integer' },
    leadsProcessed: { type: 'integer' },
    leadsImported: { type: 'integer' },
    duplicatesSkipped: { type: 'integer' },
    failedLeads: { type: 'integer' },
    retryAt: { ...iso, nullable: true, description: 'Set while the job waits after Meta was busy. Otherwise null.' },
    startedAt: { ...iso, nullable: true },
    completedAt: { ...iso, nullable: true },
    createdAt: iso,
    error: { type: 'string', nullable: true, description: 'A sentence safe to show, or null. Raw Meta errors are not returned.' },
    forms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          formId: { type: 'string' },
          formName: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
          leadsProcessed: { type: 'integer' },
          leadsImported: { type: 'integer' },
          duplicatesSkipped: { type: 'integer' },
          failedLeads: { type: 'integer' },
          error: { type: 'string', nullable: true },
        },
      },
    },
  },
};

const sheetView = {
  type: 'object',
  description: 'Google Sheet connection. `script` contains this company’s secret already filled in. Do not render `script` on a public page. The secret is not returned as its own field.',
  properties: {
    connected: { type: 'boolean', description: 'True when a web app URL is saved.' },
    webAppUrl: { type: 'string', description: 'The Apps Script web app URL, or "".' },
    connectedAt: { ...iso, nullable: true },
    lastSyncAt: { ...iso, nullable: true },
    lastSyncCount: { type: 'integer', description: 'Leads written on the last successful sync.' },
    lastError: { type: 'string' },
    lastErrorAt: { ...iso, nullable: true },
    script: { type: 'string', description: 'Apps Script source with this company’s secret in place of {{SECRET}}. Treat it as a credential.' },
    message: { type: 'string', description: 'Present on connect and sync. A sentence such as "Connected — 12 leads written to your sheet".' },
  },
};

const googleIntegration = {
  type: 'object',
  description: '`webhookKey` is the google_key in plaintext. Do not render it on a public page. Show it only to the signed-in admin who must paste it into the Google Ads webhook. It is not stripped.',
  properties: {
    keySource: { type: 'string', enum: ['crm', 'env', 'none'], description: '`crm` is a key this screen created. `env` is the server-wide GOOGLE_ADS_WEBHOOK_KEY (still returned). `none` means there is no key and webhookKey is "".' },
    webhookKey: { type: 'string', description: 'The google_key. Empty string when keySource is none.' },
    keyCreatedAt: { ...iso, nullable: true, description: 'Null when the key comes from the environment or there is no key.' },
    connected: { type: 'boolean', description: 'True only when a key exists AND at least one non-imported lead or a test lead has arrived. Imported-only files do not count.' },
    leads: { type: 'integer', description: 'Non-test leads, including imported ones.' },
    testLeads: { type: 'integer' },
    importedLeads: { type: 'integer' },
    lastLeadAt: { ...iso, nullable: true, description: 'Latest live (not test, not imported) lead.' },
    lastTestAt: { ...iso, nullable: true },
    forms: {
      type: 'array',
      maxItems: 50,
      description: 'Up to 50 forms that have sent a non-test lead, newest activity first.',
      items: { type: 'object', properties: { formId: { type: 'string' }, campaignId: { type: 'string' }, leads: { type: 'integer' }, lastLeadAt: iso } },
    },
  },
};

const superadmin = 'Role `superadmin` only. Any other signed-in role is 403 "You do not have access to this area". No email is sent.';
const companyAdmin = 'Role `company` only (the company admin). A branch owner, staff member, or client is 403 "You do not have access to this area".';
const masters = 'Whoever manages shared masters: the company admin (role `company`), or the branch owner (role `branch`) when the organization was set up without branches. A branch owner in a company that has branches is 403 "Only your company admin can change these settings." Staff and clients are 403 "You do not have access to this area".';
const branchWorkspace = 'Role `branch` (the branch owner) or `company` (the company admin, acting in the branch stored on the token). Staff and clients are 403 "You do not have access to this area". A suspended company is 403 "This company account is suspended. Contact the platform administrator."';
const integrationWho = `${branchWorkspace} The same role check runs again inside the leads router; a failure there is 403 \`{ "message": "Forbidden" }\` instead of the shared \`error\` body. Handler failures on these routes use \`message\`, not \`error\`. A missing token is still the shared 401.`;

const metaGraphNote = 'Calls that talk to Meta can also return 409 `{ code: "META_RECONNECT_REQUIRED", message: "The Meta connection has expired or was revoked. Please reconnect Meta." }`, 403 `{ code: "META_PERMISSION_DENIED", message: "Meta denied access. Make sure every requested permission was granted and that you can access this Page and its leads." }` (do not send the user to sign-in), 429 `{ code: "META_RATE_LIMITED", message: "Meta rate limit reached. Please try again in a few minutes." }`, 404 `{ code: "META_NOT_AVAILABLE", message: "The requested Facebook Page or lead form is not available on Meta." }`, or 502 `{ code: "META_UNAVAILABLE", message: "Meta is temporarily unavailable. Please try again." }`. A 500 from these handlers is `{ "message": "..." }`, not the shared "Internal server error" body.';

const assetUpload = {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string', format: 'binary', description: 'The form field name is `file`. PNG, JPG, or WebP, at most 2 MB. The type is checked from the file bytes, not the browser’s Content-Type.' },
        },
      },
    },
  },
};

const uploadErrors = 'Rate limit: 60 uploads per signed-in user per 10 minutes, and at most 3 uploads in flight (429 "Too many uploads at once. Wait for the others to finish."). Over 2 MB is 400 `{ error: "That file is too large" }`. Wrong type is 400 "Upload a PNG, JPG or WebP image", or "That file is not a valid PNG, JPG or WebP image" when the bytes do not match. No file is 400 "Choose an image to upload". A refused upload leaves no file behind.';

export default {
  '/api/admin/plans': {
    get: {
      tags: ['Admin'],
      operationId: 'adminListPlans',
      summary: 'List every subscription plan, including inactive ones.',
      description: `${superadmin} Sorted by sortOrder, then oldest first. Use this for the plan table. Deleting a built-in plan is refused; deactivate it with PATCH instead.`,
      security: bearer,
      responses: {
        '200': ok('Every plan.', { type: 'array', items: planDocument }, [{ id: '665f1c2a3b4d5e6f7a8b9c0d', code: 'pro', name: 'Pro', description: 'For a company with several branches', kind: 'fixed', priceMonthly: 4999, maxConcurrentLogins: 5, maxBranches: 3, maxClients: 500, maxDesigns: 1000, features: ['PDF branding'], selfServe: true, active: true, sortOrder: 2, forCompany: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]),
        ...auth,
      },
    },
    post: {
      tags: ['Admin'],
      operationId: 'adminCreatePlan',
      summary: 'Create a subscription plan.',
      description: `${superadmin} \`code\` is required by the service even though the validator does not list it: missing code is 400 "Plan code is required" (no VALIDATION code). It is trimmed and stored lower case. A duplicate code is 400 "That plan code is already in use". \`kind\` is \`custom\` only when you send kind "custom"; anything else, including omitting it, stores \`fixed\`. A fixed plan being created must have priceMonthly greater than 0 ("Fixed plans need a monthly price"). A custom plan stores price 0 and selfServe false. The four caps are required by the service: omitting one is 400 "Concurrent sign-ins must be at least 1 (plans have no unlimited option)" (same sentence for Branches, Clients, Designs). Features: a list of at most 20 strings, each at most 100 characters; blanks and case-insensitive duplicates are dropped. "Features must be a list" if it is not an array. selfServe defaults to true on a fixed plan unless you send false. active defaults to true unless you send false. sortOrder defaults to 0. Name is required ("Name is required" / "Plan name is required"). No email is sent.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'code', 'maxConcurrentLogins', 'maxBranches', 'maxClients', 'maxDesigns'],
              properties: {
                name: { type: 'string', maxLength: 120 },
                code: { type: 'string', maxLength: 40, description: 'Unique. Stored lower case.' },
                description: { type: 'string', maxLength: 300 },
                kind: { type: 'string', enum: ['fixed', 'custom'], description: 'Omit for fixed.' },
                priceMonthly: { type: 'number', minimum: 0, maximum: 10000000, description: 'Required and > 0 for a new fixed plan. Forced to 0 when kind is custom.' },
                maxConcurrentLogins: { type: 'integer', minimum: 1, maximum: 1000 },
                maxBranches: { type: 'integer', minimum: 1, maximum: 500 },
                maxClients: { type: 'integer', minimum: 1 },
                maxDesigns: { type: 'integer', minimum: 1 },
                features: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } },
                selfServe: { type: 'boolean' },
                active: { type: 'boolean' },
                sortOrder: { type: 'number' },
              },
              example: { name: 'Growth', code: 'growth', description: 'Three branches', kind: 'fixed', priceMonthly: 7999, maxConcurrentLogins: 4, maxBranches: 3, maxClients: 300, maxDesigns: 600, features: ['PDF branding', 'Excel import'], selfServe: true, active: true, sortOrder: 3 },
            },
          },
        },
      },
      responses: {
        '201': ok('The created plan.', planDocument),
        ...authValidated,
      },
    },
  },
  '/api/admin/plans/{id}': {
    patch: {
      tags: ['Admin'],
      operationId: 'adminUpdatePlan',
      summary: 'Change a plan. Omitted fields stay as they are.',
      description: `${superadmin} Partial. The service merges your body onto the saved plan, then cleans it. Sending a different \`code\` is 400 "Plan code cannot be changed"; sending the same code is fine; omitting code leaves it. An empty name is 400 "Plan name is required". Setting kind to custom forces priceMonthly to 0 and selfServe to false. A fixed plan’s price may be 0 on update (the “price required” check is only for create). Each cap must stay at least 1. Unknown id is 404 "Plan not found". Companies already on the plan are not moved by this call.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Every field optional. Omit a key to leave it unchanged.',
              properties: {
                name: { type: 'string', maxLength: 120 },
                code: { type: 'string', description: 'Must match the current code if you send it.' },
                description: { type: 'string', maxLength: 300 },
                kind: { type: 'string', enum: ['fixed', 'custom'] },
                priceMonthly: { type: 'number', minimum: 0, maximum: 10000000 },
                maxConcurrentLogins: { type: 'integer', minimum: 1, maximum: 1000 },
                maxBranches: { type: 'integer', minimum: 1, maximum: 500 },
                maxClients: { type: 'integer', minimum: 1 },
                maxDesigns: { type: 'integer', minimum: 1 },
                features: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 }, description: 'Send [] to clear the list. Omit to leave it.' },
                selfServe: { type: 'boolean' },
                active: { type: 'boolean', description: 'Send false to hide the plan from companies. This is how you retire a built-in plan.' },
                sortOrder: { type: 'number' },
              },
              example: { active: false },
            },
          },
        },
      },
      responses: {
        '200': ok('The saved plan.', planDocument),
        ...authValidatedFound,
      },
    },
    delete: {
      tags: ['Admin'],
      operationId: 'adminDeletePlan',
      summary: 'Delete a plan that is not one of the built-in codes.',
      description: `${superadmin} Codes \`basic\`, \`pro\`, and \`custom\` cannot be deleted: 400 "Built-in plans cannot be deleted. Deactivate them instead." Unknown id is 404 "Plan not found". Does not move companies that still point at the plan.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': ok('Deleted.', okTrue, { ok: true }),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/admin/plan-requests': {
    get: {
      tags: ['Admin'],
      operationId: 'adminListPlanRequests',
      summary: 'List every plan request, newest first.',
      description: `${superadmin} No query filters. \`company\` is populated as \`{ id, name, email }\`. \`plan\` is the populated plan document or null. \`requestedPlan\` is the short card, or null when the request has no preset plan. \`companyName\` is repeated as a string.`,
      security: bearer,
      responses: {
        '200': ok('All requests.', { type: 'array', items: planRequest }),
        ...auth,
      },
    },
  },
  '/api/admin/plan-requests/{id}/approve': {
    post: {
      tags: ['Admin'],
      operationId: 'adminApprovePlanRequest',
      summary: 'Approve a pending plan request and move the company onto that plan.',
      description: `${superadmin} Only a pending request can be approved. Otherwise 400 "This request has already been decided". Unknown id is 404 "Plan request not found". Missing company is 404 "Company not found".\n\nA preset request copies that fixed plan onto the company (caps and monthly price). 400 "The requested plan is no longer available" if the plan is gone, inactive, or not fixed.\n\nA custom request creates a dedicated plan. Limits you omit fall back to what the company asked for. They are range-checked: concurrent sign-ins and branches 1 to 500 ("Concurrent logins must be at least 1" / "cannot exceed 500", and the same for Branches), clients and designs 1 to 10000000. priceMonthly omitted or "" uses the price calculated from those limits; a negative or non-numeric price is 400 "Enter a valid monthly price". planName omitted or blank becomes "{company name} Custom" (at most 80 characters).\n\nperiodDays omitted becomes 30. The validator rejects values outside 1 to 366. The company’s subscription restarts today for that many days, status active, cancelAtPeriodEnd false. The approved sign-in limit is written on the organization and every branch, whichever branch made the request, so each branch’s owners and the company admin may each have that many devices signed in. The branch cap is never set below the number of branches the company already has. Payment is not collected here. No email is sent. The response is the request, not the company.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'All optional. Preset requests only need periodDays and adminNotes. Custom requests use the limit and price fields.',
              properties: {
                planName: { type: 'string', maxLength: 80, description: 'Custom requests. Blank uses "{company} Custom".' },
                maxConcurrentLogins: { type: 'integer', minimum: 1, maximum: 500, description: 'Custom. Omit to use what the company asked.' },
                maxBranches: { type: 'integer', minimum: 1, maximum: 500 },
                maxClients: { type: 'integer', minimum: 1 },
                maxDesigns: { type: 'integer', minimum: 1 },
                priceMonthly: { type: 'number', minimum: 0, maximum: 10000000, description: 'Custom. Omit or "" to use the calculated price.' },
                periodDays: { type: 'integer', minimum: 1, maximum: 366, description: 'Billing period to start now. Omit for 30.' },
                adminNotes: { type: 'string', maxLength: 2000, description: 'Stored on the request. Omit to leave the previous note.' },
              },
              example: { periodDays: 30, adminNotes: 'Paid by transfer on 23 Nov.', priceMonthly: 6500, maxConcurrentLogins: 4, maxBranches: 2, maxClients: 200, maxDesigns: 400 },
            },
          },
        },
      },
      responses: {
        '200': ok('The approved request. status is approved. For a custom request, dedicatedPlan is the new plan id and requestedPlan is null (the preset plan field was empty).', planRequest),
        ...authValidatedFound,
      },
    },
  },
  '/api/admin/plan-requests/{id}/reject': {
    post: {
      tags: ['Admin'],
      operationId: 'adminRejectPlanRequest',
      summary: 'Reject a pending plan request without changing the company’s plan.',
      description: `${superadmin} Pending only. Otherwise 400 "This request has already been decided". Unknown id is 404 "Plan request not found". Sets status to rejected, decidedAt to now, decidedBy to you. The company’s plan and subscription do not change. No email is sent.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { adminNotes: { type: 'string', maxLength: 2000, description: 'Omit to leave the previous note. "" stores an empty note.' } },
              example: { adminNotes: 'Please call us before we change the plan.' },
            },
          },
        },
      },
      responses: {
        '200': ok('The rejected request.', planRequest),
        ...authValidatedFound,
      },
    },
  },
  '/api/admin/free-proposals': {
    get: {
      tags: ['Admin'],
      operationId: 'adminListFreeProposals',
      summary: 'List visitor proposals from the public site, newest first.',
      description: `${superadmin} One page. \`logo\` is left out of each item (it can be large); open one record to see it. \`status\` filters only when it is new, contacted, converted, or closed. Any other status is ignored and the list is not filtered. No email is sent.`,
      security: bearer,
      parameters: [
        pageQuery(1, 100),
        limitQuery(20, 100),
        { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['new', 'contacted', 'converted', 'closed'] }, description: 'Optional filter. Any other value is ignored.' },
      ],
      responses: {
        '200': ok('A page of proposals without logo.', paged(freeProposal), { items: [], total: 0, page: 1, limit: 20 }),
        ...auth,
      },
    },
  },
  '/api/admin/free-proposals/{id}': {
    get: {
      tags: ['Admin'],
      operationId: 'adminGetFreeProposal',
      summary: 'Read one visitor proposal, including its logo.',
      description: `${superadmin} Unknown id is 404 "Free proposal not found". \`logo\` is a data URL or "". \`token\` is the visitor’s link; do not show it on a public page.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': ok('The proposal, with logo and data.', freeProposal),
        ...authFound,
      },
    },
    patch: {
      tags: ['Admin'],
      operationId: 'adminUpdateFreeProposal',
      summary: 'Set a visitor proposal’s status or admin notes.',
      description: `${superadmin} Partial. Omit a key to leave it. You cannot edit the proposal body or the logo here. The response also omits \`logo\`. Unknown status is 400 "Unknown status" (the validator already limits the enum). adminNotes is trimmed to 2000 characters; "" clears it. Unknown id is 404 "Free proposal not found".`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['new', 'contacted', 'converted', 'closed'] },
                adminNotes: { type: 'string', maxLength: 2000, description: 'Omit to leave. "" clears.' },
              },
              example: { status: 'contacted', adminNotes: 'Called on 23 Nov. Asked for a site visit.' },
            },
          },
        },
      },
      responses: {
        '200': ok('The proposal after the change, without logo.', freeProposal),
        ...authValidatedFound,
      },
    },
    delete: {
      tags: ['Admin'],
      operationId: 'adminDeleteFreeProposal',
      summary: 'Delete a visitor proposal.',
      description: `${superadmin} Removes the row. Unknown id is 404 "Free proposal not found". The visitor’s link stops working.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': ok('Deleted.', okTrue, { ok: true }),
        ...authFound,
      },
    },
  },
  '/api/admin/contact-messages': {
    get: {
      tags: ['Admin'],
      operationId: 'adminListContactMessages',
      summary: 'List Contact Us messages from the public site, newest first.',
      description: `${superadmin} \`status\` filters only when it is new, contacted, or closed. Any other value is ignored.`,
      security: bearer,
      parameters: [
        pageQuery(1, 100),
        limitQuery(20, 100),
        { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['new', 'contacted', 'closed'] }, description: 'Optional filter. Any other value is ignored.' },
      ],
      responses: {
        '200': ok('A page of messages.', paged(contactMessage), { items: [], total: 0, page: 1, limit: 20 }),
        ...auth,
      },
    },
  },
  '/api/admin/contact-messages/{id}': {
    get: {
      tags: ['Admin'],
      operationId: 'adminGetContactMessage',
      summary: 'Read one Contact Us message.',
      description: `${superadmin} Unknown id is 404 "Contact message not found". Includes the visitor’s ip, user agent, and referrer.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': ok('The message.', contactMessage),
        ...authFound,
      },
    },
    patch: {
      tags: ['Admin'],
      operationId: 'adminUpdateContactMessage',
      summary: 'Set a contact message’s status or admin notes.',
      description: `${superadmin} Partial. Omit a key to leave it. Unknown status is 400 "Unknown status". adminNotes is trimmed to 2000 characters; "" clears it. The visitor’s name, email, phone, and message cannot be edited. Unknown id is 404 "Contact message not found". No email is sent.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['new', 'contacted', 'closed'] },
                adminNotes: { type: 'string', maxLength: 2000 },
              },
              example: { status: 'contacted', adminNotes: 'Sent a brochure.' },
            },
          },
        },
      },
      responses: {
        '200': ok('The message after the change.', contactMessage),
        ...authValidatedFound,
      },
    },
    delete: {
      tags: ['Admin'],
      operationId: 'adminDeleteContactMessage',
      summary: 'Delete a Contact Us message.',
      description: `${superadmin} Unknown id is 404 "Contact message not found".`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': ok('Deleted.', okTrue, { ok: true }),
        ...authFound,
      },
    },
  },
  '/api/admin/stats': {
    get: {
      tags: ['Admin'],
      operationId: 'adminPlatformStats',
      summary: 'Platform totals for the admin overview.',
      description: `${superadmin} Counts every company, client, and design. kwp is the sum of design summary.kwp, or 0.`,
      security: bearer,
      responses: {
        '200': ok('Platform totals.', {
          type: 'object',
          properties: {
            companies: { type: 'integer', description: 'All companies, any status.' },
            active: { type: 'integer' },
            suspended: { type: 'integer', description: 'companies − active.' },
            clients: { type: 'integer' },
            designs: { type: 'integer' },
            kwp: { type: 'number' },
          },
        }, { companies: 12, active: 10, suspended: 2, clients: 340, designs: 890, kwp: 1250.5 }),
        ...auth,
      },
    },
  },
  '/api/admin/counts': {
    get: {
      tags: ['Admin'],
      operationId: 'adminSidebarCounts',
      summary: 'Badge counts for the admin sidebar.',
      description: `${superadmin} \`planRequests\` is only those still pending. \`freeProposals\` and \`contactMessages\` are only those still status new.`,
      security: bearer,
      responses: {
        '200': ok('Sidebar counts.', {
          type: 'object',
          properties: {
            companies: { type: 'integer' },
            plans: { type: 'integer' },
            planRequests: { type: 'integer', description: 'Pending only.' },
            freeProposals: { type: 'integer', description: 'Status new only.' },
            contactMessages: { type: 'integer', description: 'Status new only.' },
          },
        }, { companies: 12, plans: 4, planRequests: 1, freeProposals: 3, contactMessages: 2 }),
        ...auth,
      },
    },
  },
  '/api/admin/designs/cleanup-drafts': {
    post: {
      tags: ['Admin'],
      operationId: 'adminCleanupDraftDesigns',
      summary: 'Delete draft designs that have not been touched for 30 days.',
      description: `${superadmin} No body. Looks at every company. A draft whose createdAt is 30 days ago or older is deleted, including its versions and files, unless that delete is refused (then it is counted in skipped, and the reason is not returned). cutoff is the moment used as the cutoff.`,
      security: bearer,
      responses: {
        '200': ok('How many drafts were removed.', {
          type: 'object',
          properties: {
            deleted: { type: 'integer' },
            skipped: { type: 'integer', description: 'Drafts that could not be deleted. Reasons are not included.' },
            cutoff: iso,
          },
        }, { deleted: 4, skipped: 0, cutoff: '2026-10-24T07:30:00.000Z' }),
        ...auth,
      },
    },
  },
  '/api/admin/companies': {
    get: {
      tags: ['Admin'],
      operationId: 'adminListCompanies',
      summary: 'List companies, either the full set or one filtered page.',
      description: `${superadmin} Without a \`page\` query the response is a JSON array of every branch, newest first. The overview screen uses that array. \`q\`, \`limit\`, and \`status\` are ignored unless \`page\` is also sent.\n\nWith \`page\`, the response is \`{ items, total, page, limit }\`. \`q\` is a case-insensitive match on branch name, email, or phone, on any user’s sign-in email, or on the organization name. \`status\` filters only when it is active or suspended; any other value is ignored. Default page size is 10, maximum 100.`,
      security: bearer,
      parameters: [
        { name: 'page', in: 'query', required: false, description: 'When present (even as an empty string), the list is paged. When absent, the full array is returned and the other query keys are ignored.', schema: { type: 'integer', minimum: 1 } },
        limitQuery(10, 100),
        { name: 'q', in: 'query', required: false, description: 'Search text. Used only together with page. Trimmed. Matches name, email, phone, login email, or organization name.', schema: { type: 'string' } },
        { name: 'status', in: 'query', required: false, description: 'Used only together with page. active or suspended. Anything else is ignored.', schema: { type: 'string', enum: ['active', 'suspended'] } },
      ],
      responses: {
        '200': ok('Either an array (no page query) or a page object (page query present).', { oneOf: [{ type: 'array', items: adminCompany }, paged(adminCompany)] }),
        ...auth,
      },
    },
    post: {
      tags: ['Admin'],
      operationId: 'adminCreateCompany',
      summary: 'Create a company, with or without branches, and its first sign-in.',
      description: `${superadmin} Returns 201 and the new branch in the same shape as the list. The password is hashed and is not in the response. No email is sent: give the password to the customer yourself.\n\n\`hasBranches\` false (or omitted): one workspace and one sign-in. loginEmail is the branch owner (role branch), who also manages masters. The branch is named after the company.\n\n\`hasBranches\` true: loginEmail is the company admin (role company). The first branch gets its own owner. branchOwnerEmail and branchOwnerPassword are then required ("Enter the branch owner’s email" / "Enter a password for the branch owner"). The two emails must differ ("Use a different email from the company admin"). branchName blank becomes "{company name} — Main".\n\nDuplicate emails: 400 "That login email is already in use" or "That branch owner email is already in use". Password must be 8 to 200 characters and contain a letter and a number. Default categories are seeded on the new branch.\n\n\`planId\`, when it is a real id, assigns that plan and starts a 30-day subscription. Caps you type override the plan. A company without branches is forced to maxBranches 1. \`status\` omitted is active. Send only active or suspended; that value is stored on both the organization and the first branch.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'loginEmail', 'password'],
              properties: {
                ...companyProfileFields,
                hasBranches: { type: 'boolean', description: 'Omit or false: one owner. True: a company admin plus a first branch owner. Cannot be changed later.' },
                loginEmail: { type: 'string', description: 'Required. The company admin when hasBranches is true, otherwise the only owner.' },
                password: { type: 'string', minLength: 8, maxLength: 200, description: 'At least 8 characters, with a letter and a number. Not returned.' },
                contactName: { type: 'string', maxLength: 120, description: 'Name stored on the loginEmail user. Optional. "" is allowed.' },
                branchName: { type: 'string', maxLength: 120, description: 'First branch name when hasBranches is true. Blank becomes "{name} — Main".' },
                branchOwnerName: { type: 'string', maxLength: 120 },
                branchOwnerEmail: { type: 'string', description: 'Required when hasBranches is true. Must differ from loginEmail.' },
                branchOwnerPassword: { type: 'string', description: 'Required when hasBranches is true. Same password rules. Not returned. "" is rejected.' },
                notes: { type: 'string', maxLength: 1000, description: 'Private admin notes.' },
                planId: ObjectId,
                status: { type: 'string', enum: ['active', 'suspended'], description: 'Omit for active.' },
                limits: limitsShape,
                features: featuresShape,
              },
              example: { name: 'Helio Power', loginEmail: 'admin@heliopower.example', password: 'Helio2026', contactName: 'Asha Rao', phone: '9876543210', hasBranches: false, planId: '665f1c2a3b4d5e6f7a8b9c0d' },
            },
          },
        },
      },
      responses: {
        '201': ok('The new branch, in the admin list shape.', adminCompany),
        ...authValidated,
        '409': Conflict,
      },
    },
  },
  '/api/admin/companies/{id}': {
    patch: {
      tags: ['Admin'],
      operationId: 'adminUpdateCompany',
      summary: 'Edit a branch, its plan, its caps, and its sign-in emails.',
      description: `${superadmin} Partial. Omit a key to leave it. Unknown id is 404 "Company not found". This edits one branch row. \`status\` is active or suspended for this branch only; it does not suspend the whole organization. An invalid status is 400 from the database ("… is not a valid status").\n\n\`planId\` assigns that plan. Unknown plan is 404 "Plan not found". Changing plan does not restart the billing period if one already exists. Typed caps win over the plan’s defaults. A company that already has more clients or designs than the new cap is 400 "This company already has {n} clients across its branches; the limit can’t be lower." (same sentence for designs).\n\n\`limits.maxConcurrentLogins\` is the company’s sign-in limit. It is written on the organization and copied onto every branch, so each branch’s owners and the company admin may each have that many devices signed in; it is not split between branches. A typed number wins over the plan’s number in the same save. Lowering it is always allowed. \`limits.maxBranches\` cannot go below the number of branches: 400 "This company already has {n} branches; the limit can’t be lower." Without branches, the same sign-in limit applies to the single branch’s owner and maxBranches stays 1.\n\n\`loginEmail\` changes the branch owner’s sign-in. \`contactName\` changes that user’s name. \`adminEmail\` changes the company admin; sending it (non-blank) on a company without an admin is 400 "This company has no company admin: it was set up without branches". A taken email is 400 "That email is already in use". Blank adminEmail is ignored. \`features\` (pdfBranding, excelImport) is copied onto the branch and the organization. \`notes\` is the private admin note. No email is sent.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Every field optional. The validator does not list status, planId, features, or contactName; the service still reads them.',
              properties: {
                ...companyProfileFields,
                loginEmail: { type: 'string', description: 'Branch owner sign-in. Omit to leave it. "" is rejected by the email check if you send it.' },
                adminEmail: { type: 'string', description: 'Company admin sign-in. Omit to leave it. "" is ignored. Only companies with branches have one.' },
                contactName: { type: 'string', description: 'Branch owner’s display name. Not validated as a length-limited name; stored as sent.' },
                notes: { type: 'string', maxLength: 1000, description: '"" clears the note.' },
                status: { type: 'string', enum: ['active', 'suspended'] },
                planId: { ...ObjectId, description: 'Assign this plan. Omit to leave the current plan.' },
                limits: limitsShape,
                features: featuresShape,
              },
              example: { status: 'active', notes: 'Paid annually.', limits: { maxClients: 400, maxDesigns: 800 } },
            },
          },
        },
      },
      responses: {
        '200': ok('The branch after the change, in the admin list shape.', adminCompany),
        ...authValidatedFound,
      },
    },
    delete: {
      tags: ['Admin'],
      operationId: 'adminDeleteCompany',
      summary: 'Delete one branch and everything stored in it.',
      description: `${superadmin} Irreversible. Unknown id is 404 "Company not found". Deletes the branch’s clients, designs, bills, tickets, uploads, and lead connections. If this was the organization’s last branch, the organization and the company admin login are deleted too. If other branches remain, a company admin whose login pointed at this branch is moved to another active branch (or the oldest one) and signed out of the deleted one. No email is sent.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': ok('Deleted.', okTrue, { ok: true }),
        ...authFound,
      },
    },
  },
  '/api/admin/companies/{id}/password': {
    post: {
      tags: ['Admin'],
      operationId: 'adminResetCompanyPassword',
      summary: 'Set a new password for the branch owner or the company admin.',
      description: `${superadmin} \`who\` omitted or "owner" resets the branch owner. "admin" resets the company admin. Unknown company is 404 "Company not found". Missing login is 404 "Company login not found" or "Company admin login not found". The new password must be 8 to 200 characters and contain a letter and a number. Their token version is bumped and every session of that user is revoked, so they must sign in again. The password is not returned and no email is sent.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: {
                password: { type: 'string', minLength: 8, maxLength: 200, description: 'At least one letter and one number.' },
                who: { type: 'string', enum: ['owner', 'admin'], description: 'Omit for the branch owner.' },
              },
              example: { password: 'Helio2026', who: 'owner' },
            },
          },
        },
      },
      responses: {
        '200': ok('Password replaced. Nothing else is returned.', okTrue, { ok: true }),
        ...authValidatedFound,
      },
    },
  },
  '/api/admin/companies/{id}/impersonate': {
    post: {
      tags: ['Admin'],
      operationId: 'adminImpersonateCompany',
      summary: 'Open the app as this company’s branch owner or company admin.',
      description: `${superadmin} There is no validator on the body. \`who\` "admin" signs in as the company admin; anything else, including an omitted body, signs in as the branch owner.\n\nThe response \`token\` is a bearer token for that target user, with impersonated true. Store it and send it on later calls to use their workspace. This call does not revoke the super admin token you already have. Keep that token and send it again when you want the admin console back. Signing in again as yourself also returns you to your own session. The target user’s lastLoginAt is updated.\n\nA suspended branch is 400 "Activate the company before signing in as it". A suspended organization is 403 "This company account is suspended." who "admin" on a company without branches is 400 "This company does not have a company admin workspace". A missing login is 404 "Company login not found" or "Company admin login not found". Unknown company is 404 "Company not found". No email is sent.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { who: { type: 'string', enum: ['owner', 'admin'], description: 'Omit or "owner" for the branch owner. "admin" for the company admin.' } },
              example: { who: 'owner' },
            },
          },
        },
      },
      responses: {
        '200': ok('A session for the target user. Replace the Authorization header with `token` while you are impersonating. Keep the previous super admin token so you can switch back.', impersonationResponse, { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example', impersonated: true }),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/organization/overview': {
    get: {
      tags: ['Organization'],
      operationId: 'orgGetOverview',
      summary: 'Company-wide dashboard: every branch, its usage, and the combined totals.',
      description: `${companyAdmin} Reads every branch of this organization. There is no paging. \`canCreateBranch\` is true when branchesUsed is below maxBranches. \`currency\` falls back to INR. \`generatedAt\` is when the numbers were built. \`insights\` is null when there are no branches. Each branch’s insights omit averageDeal; the combined insights include it. Revenue months are the last 12, activity the last 6, oldest first. A suspended organization is 403 "This company account is suspended." A missing organization is 404 "Organization not found".`,
      security: bearer,
      responses: {
        '200': ok('Organization dashboard.', {
          type: 'object',
          properties: {
            id: ObjectId,
            name: { type: 'string' },
            limits: limitsShape,
            maxBranches: { type: 'integer' },
            branchesUsed: { type: 'integer' },
            branchesRemaining: { type: 'integer' },
            canCreateBranch: { type: 'boolean' },
            currency: { type: 'string' },
            branches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: ObjectId,
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'suspended'] },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer' } } },
                  owner: { type: 'object', nullable: true, properties: { name: { type: 'string' }, email: { type: 'string' } }, description: 'The branch owner. Null when that login is missing. No user id.' },
                  counts: branchCounts,
                  inventory: inventoryBlock,
                  insights,
                },
              },
            },
            totals: branchCounts,
            inventory: inventoryBlock,
            insights,
            generatedAt: iso,
          },
        }),
        ...authFound,
      },
    },
  },
  '/api/organization/branches': {
    get: {
      tags: ['Organization'],
      operationId: 'orgListBranches',
      summary: 'List this company’s branches.',
      description: `${companyAdmin} Sorted by name. Each item is only id, name, status, limits, email, and phone. Use the overview when you need counts. A company that was set up without branches still has its one branch here, but only a company admin can call this route.`,
      security: bearer,
      responses: {
        '200': ok('Branches.', {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: ObjectId,
              name: { type: 'string' },
              status: { type: 'string', enum: ['active', 'suspended'] },
              limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer', description: 'Always 1 for a branch created here.' } } },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
          },
        }, [{ id: '665f1c2a3b4d5e6f7a8b9c0d', name: 'Andheri', status: 'active', limits: { maxConcurrentLogins: 1 }, email: 'andheri@heliopower.example', phone: '9876543210' }]),
        ...authFound,
      },
    },
    post: {
      tags: ['Organization'],
      operationId: 'orgCreateBranch',
      summary: 'Add a branch with its own owner sign-in.',
      description: `${companyAdmin} No validator. Name is required: 400 "Branch name is required". ownerEmail and ownerPassword are required: 400 "Enter the branch owner’s email and password". The password must be 8 to 200 characters (a letter and a digit are not required on this route). A bad email is 400 "Enter a valid email address". A taken email is 400 "That branch owner email is already in use" or "That email is already in use".\n\nA company set up without branches is 400 "This company was set up without branches. Contact the platform administrator." At the branch cap: 400 "This company can have at most {n} branch(es). Contact the platform administrator to increase the limit." The new branch gets the company’s full sign-in limit (organization.limits.maxConcurrentLogins); other branches’ numbers never block it.\n\nThe password is not returned and no email is sent. Give it to the branch owner yourself. The response is only the new branch id, name, limits, and the owner id and email.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'ownerEmail', 'ownerPassword'],
              properties: {
                name: { type: 'string', description: 'Branch name. Trimmed. Cannot be blank.' },
                ownerEmail: { type: 'string', description: 'New sign-in. Stored lower case. Must not already exist.' },
                ownerPassword: { type: 'string', minLength: 8, maxLength: 200, description: 'Not returned.' },
                ownerName: { type: 'string', description: 'Owner display name. Optional. Blank is stored as "".' },
                email: { type: 'string', description: 'Branch contact email stored on the branch, not the login. Optional. Not format-checked here.' },
                phone: { type: 'string', description: 'Optional. Not format-checked here.' },
              },
              example: { name: 'Andheri', ownerEmail: 'owner.andheri@heliopower.example', ownerPassword: 'Andheri2026', ownerName: 'Ravi Shah', phone: '9876543210' },
            },
          },
        },
      },
      responses: {
        '201': ok('The new branch and its owner. No password.', {
          type: 'object',
          properties: {
            branch: { type: 'object', properties: { id: ObjectId, name: { type: 'string' }, limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer', example: 1 } } } } },
            owner: { type: 'object', properties: { id: ObjectId, email: { type: 'string' } } },
          },
        }, { branch: { id: '665f1c2a3b4d5e6f7a8b9c0d', name: 'Andheri', limits: { maxConcurrentLogins: 1 } }, owner: { id: '665f1c2a3b4d5e6f7a8b9c0e', email: 'owner.andheri@heliopower.example' } }),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/organization/branches/{id}': {
    patch: {
      tags: ['Organization'],
      operationId: 'orgUpdateBranch',
      summary: 'Branch caps cannot be changed; this call always returns 400.',
      description: `${companyAdmin} Every branch uses the company’s full sign-in limit, set by the platform administrator. Sending limits.maxConcurrentLogins or a top-level maxConcurrentLogins (any value that is not null or missing) is 400 "Every branch can use the company’s full sign-in limit. Contact the platform administrator to change it." Any other body, including an empty object, is 400 "No branch limits to update." There is no 200. The id is not looked up.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'The service only reads limits.maxConcurrentLogins, or maxConcurrentLogins at the top level.',
              properties: {
                limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer' } } },
                maxConcurrentLogins: { type: 'integer' },
              },
            },
          },
        },
      },
      responses: {
        '400': ok('Always. Show `error`.', { $ref: '#/components/schemas/Error' }, { error: 'Each branch allows one signed-in device. This limit cannot be changed here.' }),
        ...auth,
      },
    },
  },
  '/api/organization': {
    get: {
      tags: ['Organization'],
      operationId: 'orgGetOrganization',
      summary: 'Read the shared company profile and masters.',
      description: `${masters} Adds \`role: "organization"\` on top of the organization document. Use this to fill the company settings screen that applies to every branch. Invoice and proposal numbers that the branch actually issues are on GET /api/company, not here.`,
      security: bearer,
      responses: {
        '200': ok('The organization, including role.', organizationDoc),
        ...authFound,
      },
    },
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateOrganization',
      summary: 'Save the shared company profile. Omitted fields stay as they are.',
      description: `${masters} Partial. Same body as the branch settings form. Name, email, phone, address, tax, website, bank, theme, PDF terms, pricing, product units, and job titles are saved on the organization, so every branch sees them. Sending invoiceNumbering writes it on the organization document, but branches do not take invoice numbers from here: change a branch’s series with PUT /api/company. proposalNumbering is ignored on this route (it is not an organization field). Status, plan, limits, and notes sent here are ignored. The response is the organization document and does not add \`role\`. Theme colours that are not #rrggbb are 400 "Theme colours must be hex values like #1d4ed8". Product units or job titles that end up empty are 400 "Keep at least one unit" or "Keep at least one role".`,
      security: bearer,
      requestBody: { required: true, content: { 'application/json': { schema: companySelfBody } } },
      responses: {
        '200': ok('The saved organization. No `role` field.', organizationDoc),
        ...authValidatedFound,
      },
    },
  },
  '/api/organization/catalog-settings': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateCatalogSettings',
      summary: 'Save currency, tax, tariff, and product units for every branch.',
      description: `${masters} Partial. Omit a key to leave it. Only currency, taxLabel, taxRate, tariff, otherCostPerKw, and productUnits are written. Product units replace the list; blanks and repeats are dropped; at least one and at most 60; each label at most 20 characters; 400 "Keep at least one unit", "Invalid units", or "You can have up to 60 units". The response is the full organization document, not only these fields.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                currency: { type: 'string', description: '3-letter code, stored upper case.', example: 'INR' },
                taxLabel: { type: 'string', maxLength: 20 },
                taxRate: { type: 'number', minimum: 0, maximum: 100 },
                tariff: { type: 'number', minimum: 0, maximum: 1000 },
                otherCostPerKw: { type: 'number', minimum: 0, maximum: 10000000 },
                productUnits: { type: 'array', maxItems: 60, items: { type: 'string', maxLength: 20 } },
              },
              example: { currency: 'INR', taxLabel: 'GST', taxRate: 18, tariff: 8, productUnits: ['Nos', 'Set', 'Metre'] },
            },
          },
        },
      },
      responses: {
        '200': ok('The organization after the change.', organizationDoc),
        ...authValidatedFound,
      },
    },
  },
  '/api/organization/lead-form': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateLeadForm',
      summary: 'Replace the company’s extra lead-form fields.',
      description: `${masters} No validator. Send \`fields\`: the custom fields only. The response puts the three fixed fields first (name, phone, address, each with fixed true), then yours. There is no partial update: the array you send replaces the custom fields. A field you send with a \`key\` that already exists keeps that key so old answers stay linked. A new field’s key is built from its label.\n\nAt most 40 custom fields ("A form can have up to 40 fields of your own"). "The form must be a list of fields" if fields is not an array. Each field needs a label ("Field {n} needs a name"). Labels must be unique and must not be Name, Phone, or Address. type is one of text, textarea, number, phone, email, select, multiselect, date, yesno ("Choose a type for “{label}”"). select and multiselect need 1 to 50 choices, each at most 60 characters. help is at most 200 characters. required is true only when you send true. These messages are 400 \`{ error }\`.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fields'],
              properties: { fields: { type: 'array', maxItems: 40, items: leadField } },
              example: { fields: [{ key: 'monthly_bill', label: 'Monthly bill', type: 'number', required: false, help: 'Average of the last 3 months' }, { label: 'Roof type', type: 'select', required: true, options: ['Concrete', 'Tin shed', 'Factory'] }] },
            },
          },
        },
      },
      responses: {
        '200': ok('The full form: three fixed fields, then the custom ones.', { type: 'array', items: leadField }, [
          { key: 'name', label: 'Name', type: 'text', required: true, fixed: true },
          { key: 'phone', label: 'Phone', type: 'phone', required: true, fixed: true },
          { key: 'address', label: 'Address', type: 'textarea', required: false, fixed: true },
          { key: 'monthly_bill', label: 'Monthly bill', type: 'number', required: false, help: 'Average of the last 3 months', options: [] },
        ]),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/organization/installation-steps': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateInstallationSteps',
      summary: 'Replace the installation step template for every branch.',
      description: `${masters} No validator. The array replaces the template. Installations already started keep the steps they were given. "Steps are required" if steps is not an array. More than 30 is 400 "You can have up to 30 steps". A blank name is 400 "Step name is required". role must be empty or one of the company’s job titles: 400 "Choose a role from your list". priority omitted, null, or "" becomes medium. An unknown priority is 400 "Invalid step priority". Names longer than 80 characters fail when the document is saved.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['steps'],
              properties: { steps: { type: 'array', maxItems: 30, items: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 400 }, role: { type: 'string', maxLength: 40 }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } } } } },
              example: { steps: [{ name: 'Site inspection', description: 'Check the roof and the meter', role: 'Site surveyor', priority: 'high' }] },
            },
          },
        },
      },
      responses: {
        '200': ok('The saved steps, in the order you sent.', { type: 'array', items: installationStep }),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/organization/amc-templates': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateAmcTemplates',
      summary: 'Replace the AMC schedule. New mandatory visits are added to installations already finished.',
      description: `${masters} The array replaces the template. Visits already on an installation are kept. A new mandatory template is also copied onto installations that are already completed. Optional templates are not scheduled until someone books them. The saved list is sorted by days, then name.\n\n"Templates are required" if templates is not an array. More than 20 is 400 "You can have up to 20 AMC schedules" (the validator says "Up to 20 AMC schedules"). A blank name is 400 "AMC {n}: name is required". Mandatory without a day count is 400 "AMC “{name}”: days after installation is required for mandatory visits" (the validator says "Days after installation is required for mandatory visits"). Days must be 1 to 3650. Price must be 0 or more. More than 40 criteria is 400 "Up to 40 criteria per AMC". Description is sanitised HTML. kind omitted is stored as mandatory. Send null or "" for daysAfterInstallation on an optional visit.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['templates'],
              properties: { templates: { type: 'array', maxItems: 20, items: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 80 }, daysAfterInstallation: { type: 'integer', nullable: true, minimum: 1, maximum: 3650 }, kind: { type: 'string', enum: ['mandatory', 'optional'] }, price: { type: 'number', minimum: 0, maximum: 1000000000 }, description: { type: 'string', maxLength: 30000 }, criteria: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 200 } } } } } },
              example: { templates: [{ name: 'Year 1 service', daysAfterInstallation: 365, kind: 'mandatory', price: 0, description: '', criteria: ['Check inverter', 'Clean panels'] }] },
            },
          },
        },
      },
      responses: {
        '200': ok('The saved templates, sorted by days then name.', { type: 'array', items: amcTemplate }),
        ...authValidatedFound,
      },
    },
  },
  '/api/organization/loan-steps': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateLoanSteps',
      summary: 'Replace the loan step template. Loans already open keep their own steps.',
      description: `${masters} The array replaces the template. An empty array clears it. At most 30 steps ("You can have up to 30 steps"). Each name is required and at most 80 characters ("Step name is required"). Description is optional, at most 400 characters, stored as "" when blank.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['steps'],
              properties: { steps: { type: 'array', maxItems: 30, items: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 400 } } } } },
              example: { steps: [{ name: 'Documents collected', description: 'ID, address, and the electricity bill.' }] },
            },
          },
        },
      },
      responses: {
        '200': ok('The saved loan steps.', { type: 'array', items: namedStep }),
        ...authValidatedFound,
      },
    },
  },
  '/api/organization/subsidy-steps': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateSubsidySteps',
      summary: 'Replace the subsidy step template. Subsidy files already open keep their own steps.',
      description: `${masters} Same rules as the loan template. New companies start with the PM Surya Ghar steps, but this call replaces whatever is stored. At most 30. Name required, at most 80 characters. Description optional, at most 400.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['steps'],
              properties: { steps: { type: 'array', maxItems: 30, items: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 400 } } } } },
              example: { steps: [{ name: 'Registered on the portal', description: 'Client registered with the DISCOM.' }] },
            },
          },
        },
      },
      responses: {
        '200': ok('The saved subsidy steps.', { type: 'array', items: namedStep }),
        ...authValidatedFound,
      },
    },
  },
  '/api/organization/expense-reasons': {
    put: {
      tags: ['Organization'],
      operationId: 'orgUpdateExpenseReasons',
      summary: 'Replace the expense reasons offered on project expenses.',
      description: `${masters} The array replaces the list. Blanks and case-insensitive duplicates are dropped. At least one must remain: 400 "Add at least one expense reason". At most 50 ("Up to 50 reasons"). Each reason at most 300 characters. The response is the array of strings, not the organization.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reasons'],
              properties: { reasons: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', maxLength: 300 } } },
              example: { reasons: ['Transport of material', 'Labour charges', 'Electrical work'] },
            },
          },
        },
      },
      responses: {
        '200': ok('The saved reasons, in order, duplicates removed.', { type: 'array', items: { type: 'string' } }, ['Transport of material', 'Labour charges', 'Electrical work']),
        ...authValidatedFound,
      },
    },
  },
  '/api/organization/assets/{kind}': {
    post: {
      tags: ['Organization'],
      operationId: 'orgUploadAsset',
      summary: 'Upload a shared branding image and return the organization.',
      description: `${masters} Multipart field name is \`file\`. ${uploadErrors} The previous image of this kind is replaced. The response is the organization with \`role: "organization"\`. The matching field (logo, signature, qr, or paymentQr) is a path starting with /uploads/.`,
      security: bearer,
      parameters: [kindParam],
      requestBody: assetUpload,
      responses: {
        '200': ok('The organization, with the new image path.', organizationDoc),
        '400': ValidationError,
        '429': RateLimited,
        ...authFound,
      },
    },
    delete: {
      tags: ['Organization'],
      operationId: 'orgDeleteAsset',
      summary: 'Remove a shared branding image.',
      description: `${masters} Deletes the file and sets that field to "". Unknown kind is 400 "Unknown asset". The response is the organization with \`role: "organization"\`.`,
      security: bearer,
      parameters: [kindParam],
      responses: {
        '200': ok('The organization, with that image cleared.', organizationDoc),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/company': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetProfile',
      summary: 'Read the branch you are signed into, with shared masters already applied.',
      description: `${branchWorkspace} This is the settings screen payload. Shared branding, steps, pricing, units, job titles, the lead form, and features come from the organization. \`billing\` is the subscription summary. \`invoiceNumbering.nextInvoiceNo\` and \`proposalNumbering.nextProposalNo\` are previews; reading them does not reserve a number. Platform notes and the plan id are not included.`,
      security: bearer,
      responses: {
        '200': ok('The branch profile.', companyView),
        ...auth,
      },
    },
    put: {
      tags: ['Company'],
      operationId: 'companyUpdateProfile',
      summary: 'Save this branch’s profile. Shared settings change only when you manage masters.',
      description: `${branchWorkspace} Partial. Omit a key to leave it.\n\nWritten on this branch: name, email, phone, alternatePhone, address, website, taxId, pan, invoiceNumbering, proposalNumbering.\n\nWritten on the organization (every branch then sees them) only when the value actually changed and you manage masters: signatory name and title, QR labels, bank details, tagline, pdfTerms, currency, tax, tariff, otherCostPerKw, theme, productUnits, agentRoles. A branch owner in a company that has branches may send those fields back unchanged with the rest of the form. Changing one of them is 403 "Branding, PDF terms, pricing, units and job titles are set by your company admin for every branch."\n\nInvoice numbering: prefix plus next as digits with leading zeros ("0001"). A number already issued under that prefix is 400 "{number} is already used. Numbers up to {last} exist, so start from {next} or later". Proposal numbering is prefix + next + suffix, with the same reuse rule. Theme colours must be #rrggbb. Product units and job titles cannot be emptied. The response is the branch profile again, masters included.`,
      security: bearer,
      requestBody: { required: true, content: { 'application/json': { schema: companySelfBody } } },
      responses: {
        '200': ok('The branch profile after the save.', companyView),
        ...authValidated,
      },
    },
  },
  '/api/company/subscription': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetSubscription',
      summary: 'Read the current plan, caps, and renewal.',
      description: `${branchWorkspace} \`plan\` is null when no plan is linked. \`limits\` is only the sign-in cap in force for this branch. \`companyLimits\` is the organization caps (branches, clients, designs). \`subscription.daysRemaining\` is null when there is no period end. Amounts are the plan’s monthly price.`,
      security: bearer,
      responses: {
        '200': ok('Plan and renewal.', companyView.properties.billing),
        ...auth,
      },
    },
  },
  '/api/company/subscription/usage': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetSubscriptionUsage',
      summary: 'Read how much of the company-wide caps is already used.',
      description: `${branchWorkspace} Clients and designs are counted across every branch. \`usage.branches\` is how many branches the organization has.`,
      security: bearer,
      responses: {
        '200': ok('Caps and usage.', {
          type: 'object',
          properties: {
            limits: { type: 'object', properties: { maxBranches: { type: 'integer' }, maxClients: { type: 'integer', nullable: true }, maxDesigns: { type: 'integer', nullable: true } } },
            usage: { type: 'object', properties: { branches: { type: 'integer' }, clients: { type: 'integer' }, designs: { type: 'integer' } } },
          },
        }, { limits: { maxBranches: 3, maxClients: 500, maxDesigns: 1000 }, usage: { branches: 2, clients: 140, designs: 320 } }),
        ...auth,
      },
    },
  },
  '/api/company/subscription/upgrades': {
    get: {
      tags: ['Company'],
      operationId: 'companyListUpgrades',
      summary: 'List higher self-serve plans and what each would cost today.',
      description: `${branchWorkspace} Only active fixed plans with selfServe true and a higher monthly price than the current plan. Each item is the plan card plus \`quote\`. A company on a custom plan is 403 "Your plan is managed by the platform administrator. Contact them to change it." This does not change the plan. Payment is still requested with POST /api/company/plan-request.`,
      security: bearer,
      responses: {
        '200': ok('Higher plans, cheapest first.', { type: 'array', items: { allOf: [planSummary, { type: 'object', properties: { quote: quoteShape } }] } }),
        ...auth,
      },
    },
  },
  '/api/company/subscription/quote': {
    get: {
      tags: ['Company'],
      operationId: 'companyQuoteUpgrade',
      summary: 'Price a move onto one higher self-serve plan.',
      description: `${branchWorkspace} Query \`planId\` is required. Unknown id is 404 "Plan not found". 400 "That plan is not available for self-serve upgrade" when the target is inactive, custom, or not self-serve. 400 "No active plan on this company" when this company has no plan. 403 "Contact the platform administrator to change a custom plan" when the current plan is custom. 400 "Choose a higher plan to upgrade" when the target is not more expensive. Does not change the plan.`,
      security: bearer,
      parameters: [{ name: 'planId', in: 'query', required: true, description: 'The plan to price. 24 hex characters.', schema: ObjectId }],
      responses: {
        '200': ok('Current plan, target plan, and the prorated quote.', { type: 'object', properties: { current: planSummary, target: planSummary, quote: quoteShape } }),
        '400': ValidationError,
        ...authFound,
      },
    },
  },
  '/api/company/plan-request': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetPlanRequest',
      summary: 'Read this branch’s latest plan request, or null.',
      description: `${branchWorkspace} The newest request of any status, so the screen can show how the last one ended. \`null\` (JSON null, status 200) when this branch has never asked. \`plan\` is an id string or null. \`requestedPlan\` is the short card when a preset plan was asked for.`,
      security: bearer,
      responses: {
        '200': ok('The latest request, or null.', { ...planRequest, nullable: true }),
        ...auth,
      },
    },
    post: {
      tags: ['Company'],
      operationId: 'companySubmitPlanRequest',
      summary: 'Ask the platform admin to change this branch’s plan.',
      description: `${branchWorkspace} Rate limit: 10 requests per signed-in user per hour. A second pending request is 409 "You already have a plan request waiting for approval." (also when two submits race).\n\ntype "preset": planId must be an active fixed self-serve plan. Otherwise 400 "That plan is not available to request". The same plan the company is already on is 400 "You are already on this plan". The requested caps are copied from that plan. message is optional.\n\ntype "custom": message is required, 400 "Describe what you need from a custom plan". requestedLimits are optional; a missing cap falls back to 2 sign-ins, 1 branch, 100 clients, 200 designs. A cap below 1 is 400 "{label} must be at least 1". The validator allows sign-ins and branches up to 500.\n\nNothing is billed and the plan does not change until an admin approves. No email is sent. 201 returns the new pending request.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['type'],
              properties: {
                type: { type: 'string', enum: ['preset', 'custom'] },
                planId: { type: 'string', description: 'Required for preset. 24 hex characters, or "" . Ignored for custom.' },
                message: { type: 'string', maxLength: 2000, description: 'Required for custom. Optional for preset.' },
                requestedLimits: {
                  type: 'object',
                  description: 'Custom only. Omit a cap to use the fallback.',
                  properties: {
                    maxConcurrentLogins: { type: 'integer', minimum: 1, maximum: 500 },
                    maxBranches: { type: 'integer', minimum: 1, maximum: 500 },
                    maxClients: { type: 'integer', minimum: 1 },
                    maxDesigns: { type: 'integer', minimum: 1 },
                  },
                },
              },
              example: { type: 'preset', planId: '665f1c2a3b4d5e6f7a8b9c0d', message: 'We are opening a second branch.' },
            },
          },
        },
      },
      responses: {
        '201': ok('The pending request.', planRequest),
        ...authValidated,
        '409': Conflict,
        '429': RateLimited,
      },
    },
    delete: {
      tags: ['Company'],
      operationId: 'companyCancelPlanRequest',
      summary: 'Withdraw this branch’s pending plan request.',
      description: `${branchWorkspace} Sets status to cancelled and decidedAt to now. There is no body. If nothing is pending, 404 "Plan request not found". The plan does not change.`,
      security: bearer,
      responses: {
        '200': ok('The cancelled request.', planRequest),
        ...authFound,
      },
    },
  },
  '/api/company/assets/{kind}': {
    post: {
      tags: ['Company'],
      operationId: 'companyUploadAsset',
      summary: 'Upload a shared branding image and return this branch’s profile.',
      description: `${masters} The company router also requires a branch or company role. Multipart field name is \`file\`. ${uploadErrors} The file is stored on the organization, so every branch sees it. The response is this branch’s profile (GET /api/company), with the new path on logo, signature, qr, or paymentQr.`,
      security: bearer,
      parameters: [kindParam],
      requestBody: assetUpload,
      responses: {
        '200': ok('The branch profile, with the new image path.', companyView),
        '400': ValidationError,
        '429': RateLimited,
        ...auth,
      },
    },
    delete: {
      tags: ['Company'],
      operationId: 'companyDeleteAsset',
      summary: 'Remove a shared branding image and return this branch’s profile.',
      description: `${masters} Clears that image on the organization and deletes the file. Unknown kind is 400 "Unknown asset". The response is this branch’s profile with that field set to "".`,
      security: bearer,
      parameters: [kindParam],
      responses: {
        '200': ok('The branch profile, with that image cleared.', companyView),
        '400': ValidationError,
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/lead-statuses': {
    get: {
      tags: ['Company'],
      operationId: 'companyListLeadStatuses',
      summary: 'List lead pipeline statuses, creating the defaults the first time.',
      description: `${integrationWho} The first call for a company inserts New, Interested, Callback, Site visit, Converted (outcome converted), and Lost (outcome lost) when none exist. The list is every status that is not deleted, ordered by \`order\`. Ids are \`_id\`. Working a lead (assign, board, reports) is under /api/leads, not here.`,
      security: bearer,
      responses: {
        '200': ok('Statuses. `_id` is the id to send later.', { type: 'array', items: leadStatus }, [
          { _id: '665f1c2a3b4d5e6f7a8b9c0d', name: 'New', color: 'slate', order: 0, outcome: 'open', isConversion: false, requiresDate: false, isActive: true },
          { _id: '665f1c2a3b4d5e6f7a8b9c0e', name: 'Converted', color: 'emerald', order: 4, outcome: 'converted', isConversion: true, requiresDate: false, isActive: true },
        ]),
        ...auth,
      },
    },
    post: {
      tags: ['Company'],
      operationId: 'companyCreateLeadStatus',
      summary: 'Add a lead status at the end of the pipeline.',
      description: `${integrationWho} Name is required, at most 40 characters: 400 \`{ message: "Status name is required (max 40 characters)" }\`. A duplicate name is 400 \`{ message: "A status with this name already exists" }\`. color must be slate, blue, amber, emerald, rose, purple, or cyan ("Invalid status colour"); omit it for slate. outcome is open, converted, or lost ("Choose what this status means"). Setting converted or lost takes that role from the status that had it (the previous one becomes open). isActive on create is ignored: the new status is active. requiresDate true makes the lead form ask for a date. 201 returns the status. There is no email.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', maxLength: 40 },
                color: { type: 'string', enum: ['slate', 'blue', 'amber', 'emerald', 'rose', 'purple', 'cyan'] },
                outcome: { type: 'string', enum: ['open', 'converted', 'lost'] },
                requiresDate: { type: 'boolean' },
              },
              example: { name: 'Site visit', color: 'purple', outcome: 'open', requiresDate: true },
            },
          },
        },
      },
      responses: {
        '201': ok('The new status.', leadStatus),
        '400': msg('Show `message`.', { message: 'Status name is required (max 40 characters)' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/lead-statuses/reorder': {
    put: {
      tags: ['Company'],
      operationId: 'companyReorderLeadStatuses',
      summary: 'Set the pipeline order.',
      description: `${integrationWho} Send every status id in the new order. The first id becomes order 0. An empty list, more than 200 ids, or an id that is not 24 hex is 400 \`{ message: "Invalid status order" }\`. Ids that are not in the list keep their old order, so send the full list. The response is the full list sorted by order.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['statusIds'],
              properties: { statusIds: { type: 'array', minItems: 1, maxItems: 200, items: ObjectId } },
              example: { statusIds: ['665f1c2a3b4d5e6f7a8b9c0d', '665f1c2a3b4d5e6f7a8b9c0e'] },
            },
          },
        },
      },
      responses: {
        '200': ok('All statuses in the new order.', { type: 'array', items: leadStatus }),
        '400': msg('Show `message`.', { message: 'Invalid status order' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/lead-statuses/{id}': {
    put: {
      tags: ['Company'],
      operationId: 'companyUpdateLeadStatus',
      summary: 'Rename, recolour, or retarget one lead status.',
      description: `${integrationWho} Partial: omit a key to leave it. An id that is not 24 hex, or a missing status, is 404 \`{ message: "Lead status not found" }\`. Name, when sent, is required and at most 40 characters. Duplicate name is 400 \`{ message: "A status with this name already exists" }\`. The converted and the lost status cannot be switched off or given a different outcome: 400 \`{ message }\` explains that you must make another status that outcome first, which then turns this one into an ordinary step. Setting outcome to converted or lost takes that role from the previous holder. isActive false hides it from new choices. requiresDate true asks for a date when the status is applied to a lead.`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', maxLength: 40 },
                color: { type: 'string', enum: ['slate', 'blue', 'amber', 'emerald', 'rose', 'purple', 'cyan'] },
                outcome: { type: 'string', enum: ['open', 'converted', 'lost'] },
                isActive: { type: 'boolean' },
                requiresDate: { type: 'boolean' },
              },
              example: { name: 'Callback', color: 'blue', requiresDate: true },
            },
          },
        },
      },
      responses: {
        '200': ok('The updated status.', leadStatus),
        '400': msg('Show `message`.', { message: 'A status with this name already exists' }),
        '404': msg('Unknown id.', { message: 'Lead status not found' }),
        ...auth,
      },
    },
    delete: {
      tags: ['Company'],
      operationId: 'companyDeleteLeadStatus',
      summary: 'Hide a lead status. Leads that used it keep it in their history.',
      description: `${integrationWho} Soft-deletes the status and marks it inactive. It disappears from the list. The converted and lost statuses cannot be deleted: 400 \`{ message }\` tells you to make another status that outcome first. Unknown id is 404 \`{ message: "Lead status not found" }\`. Leads are not changed.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        '200': msg('Deleted.', { message: 'Lead status deleted' }),
        '400': msg('The converted or lost status was targeted.', { message: '“Converted” is your converted status, which every company needs. Make another status the converted one first.' }),
        '404': msg('Unknown id.', { message: 'Lead status not found' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/status': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetMetaStatus',
      summary: 'Read whether Meta is set up, connected, and receiving leads.',
      description: `${integrationWho} Use this to draw the Meta card. \`setup\` is what the admin copies into the Meta app. The App Secret is not in the response. Page access tokens are not in the response. \`webhookVerifyToken\` is empty when it is set in the server environment; when it is not empty, show it only on this settings screen. \`receivingLeads\` is true only when a page is selected, at least one form is connected, the page webhook is subscribed, and the connection does not need a reconnect. \`leadCounts.pending\` includes both pending and processing. ${metaGraphNote}`,
      security: bearer,
      responses: {
        '200': ok('Meta status. No tokens.', {
          type: 'object',
          properties: {
            configured: { type: 'boolean', description: 'True when an App ID, secret, encryption key, and redirect URI are all available.' },
            setup: metaSetup,
            webhookConfigured: { type: 'boolean' },
            connected: { type: 'boolean' },
            needsReconnect: { type: 'boolean' },
            metaUserName: { type: 'string', description: 'Facebook user name. Empty when not connected.' },
            selectedPage: { type: 'object', nullable: true, properties: { pageId: { type: 'string' }, pageName: { type: 'string' } } },
            forms: { type: 'array', items: { type: 'object', properties: { formId: { type: 'string' }, formName: { type: 'string' } } } },
            receivingLeads: { type: 'boolean' },
            connectedAt: { ...iso, nullable: true },
            lastLeadReceivedAt: { ...iso, nullable: true },
            leadCounts: { type: 'object', properties: { processed: { type: 'integer' }, pending: { type: 'integer' }, failed: { type: 'integer' } } },
          },
        }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/app-settings': {
    put: {
      tags: ['Company'],
      operationId: 'companySaveMetaAppSettings',
      summary: 'Save this company’s Meta App ID and App Secret.',
      description: `${integrationWho} The secret is checked with Meta, then stored encrypted. It is not returned. If the App ID changes, the Facebook connection (pages, forms, tokens) is cleared; collected leads stay. A verify token is kept when one already exists so an existing webhook keeps working.\n\nWhen the server environment sets META_APP_ID and META_APP_SECRET, this route is 409 \`{ message: "The Meta app is set in the server environment and cannot be changed here" }\`.\n\n400 messages: "Enter a valid Meta App ID (numbers only)" (5 to 25 digits), "Enter a valid Meta App Secret" (16 to 128 letters and digits), "Invalid CRM address" (apiBaseUrl must be http or https), "Meta did not accept this App ID and App Secret. Copy both again from App settings > Basic."\n\nfrontendRedirectUrl is kept only when it is on an allowed app origin (CORS_ORIGIN, default http://localhost:3000). Query and hash are stripped. An invalid one is stored as empty and the default integrations page is used after login.\n\nAfter a successful save the server tries to register the lead webhook. The response is \`{ message, setup }\`. setup.webhookRegistered is false when that fails. The App Secret is still not in setup. ${metaGraphNote}`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['appId', 'appSecret', 'apiBaseUrl'],
              properties: {
                appId: { type: 'string', description: 'Meta App ID. Digits only, 5 to 25.' },
                appSecret: { type: 'string', description: 'Meta App Secret. 16 to 128 letters and digits. Write-only. Never comes back.' },
                apiBaseUrl: { type: 'string', description: 'This API’s public origin, no trailing slash, http or https. Used to build the webhook URL.' },
                frontendRedirectUrl: { type: 'string', description: 'Page to open after Facebook login. Must be an allowed app origin. Optional.' },
              },
              example: { appId: '123456789012345', appSecret: 'a1b2c3d4e5f6g7h8i9j0k1l2', apiBaseUrl: 'https://api.example.com', frontendRedirectUrl: 'http://localhost:3000/dashboard/settings' },
            },
          },
        },
      },
      responses: {
        '200': ok('Saved. setup never includes the App Secret.', { type: 'object', properties: { message: { type: 'string', example: 'Meta app settings saved' }, setup: metaSetup } }),
        '400': msg('Show `message`.', { message: 'Enter a valid Meta App ID (numbers only)' }),
        '409': msg('The app is fixed in the server environment.', { message: 'The Meta app is set in the server environment and cannot be changed here' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/connect': {
    get: {
      tags: ['Company'],
      operationId: 'companyStartMetaConnect',
      summary: 'Start Facebook Login. Open the returned URL in the browser.',
      description: `${integrationWho} Returns \`{ url }\`. Navigate the browser to that URL (window.location or an equivalent full-page open). Do not fetch it and do not show it as text. It is Facebook’s OAuth dialog. The state lasts 10 minutes.\n\nOptional query \`returnTo\` is the page to land on after Facebook finishes. It must be an allowed app origin (CORS_ORIGIN, default http://localhost:3000). The query string and hash are dropped. If it is missing or not allowed, the browser returns to the frontendRedirectUrl saved with the app, or META_FRONTEND_REDIRECT_URL, or \`{origin}/dashboard/settings?tab=integrations&source=meta\`.\n\nThis route does not complete the login. The public callback (not this API for the app to call) sends the browser back with \`meta=connected\`, or \`meta=error\` and \`reason\` one of access_denied, not_configured, missing_code, not_authorized, missing_permissions, no_pages.\n\nIf the Meta app is not configured yet: 503 \`{ message: "Enter your Meta App ID and App Secret first" }\`. Page tokens are not in this response. ${metaGraphNote}`,
      security: bearer,
      parameters: [{ name: 'returnTo', in: 'query', required: false, description: 'Absolute URL of the page that should open after Facebook login. Origin must be allowed. Query and hash are removed.', schema: { type: 'string' } }],
      responses: {
        '200': ok('Open `url` in the browser window.', { type: 'object', required: ['url'], properties: { url: { type: 'string', description: 'Facebook OAuth dialog URL. Do not display it. Navigate to it.' } } }, { url: 'https://www.facebook.com/v26.0/dialog/oauth?client_id=123&redirect_uri=https%3A%2F%2Fapi.example.com%2Fapi%2Fcompany%2Fintegrations%2Fmeta%2Fcallback&state=opaque&scope=pages_show_list' }),
        '503': msg('Meta app is not configured.', { message: 'Enter your Meta App ID and App Secret first' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/pages': {
    get: {
      tags: ['Company'],
      operationId: 'companyListMetaPages',
      summary: 'List Facebook Pages available on the connected account.',
      description: `${integrationWho} 409 \`{ message: "Meta is not connected" }\` when Facebook login has not finished. Each page is pageId, pageName, and selected. Access tokens are not included. \`selected\` is true for the page whose forms are connected. ${metaGraphNote}`,
      security: bearer,
      responses: {
        '200': ok('Pages. No access tokens.', { type: 'array', items: { type: 'object', properties: { pageId: { type: 'string' }, pageName: { type: 'string' }, selected: { type: 'boolean' } } } }),
        '409': msg('Not connected yet.', { message: 'Meta is not connected' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/pages/{pageId}/forms': {
    get: {
      tags: ['Company'],
      operationId: 'companyListMetaPageForms',
      summary: 'List active lead forms on one connected Facebook Page.',
      description: `${integrationWho} \`pageId\` is the Facebook page id from the pages list, not a Mongo id. Archived and deleted forms are left out. \`selected\` is true when that form is currently connected and this page is the selected page. Unknown page is 404 \`{ message: "Facebook Page not found in the Meta connection" }\`. ${metaGraphNote}`,
      security: bearer,
      parameters: [{ name: 'pageId', in: 'path', required: true, description: 'Facebook Page id from GET …/pages. Digits, not a Mongo id.', schema: { type: 'string' } }],
      responses: {
        '200': ok('Active forms.', { type: 'array', items: { type: 'object', properties: { formId: { type: 'string' }, formName: { type: 'string' }, status: { type: 'string' }, selected: { type: 'boolean' } } } }),
        '404': msg('That page is not in this connection.', { message: 'Facebook Page not found in the Meta connection' }),
        ...auth,
      },
    },
    post: {
      tags: ['Company'],
      operationId: 'companyConnectMetaForms',
      summary: 'Subscribe the chosen lead forms so new leads arrive here.',
      description: `${integrationWho} Body \`formIds\` is 1 to 50 numeric Facebook form ids. Empty, too many, or a non-numeric id is 400 \`{ message: "Select at least one lead form" }\`. A form that is not on this page is 400 "One or more selected lead forms do not belong to this Facebook Page". A page already feeding another workspace is 409 "This Facebook Page is already connected to another workspace. Disconnect it there first."\n\nThis subscribes the page to lead webhooks, unsubscribes the previously selected page, stores the forms, and queues failed leads for another try. Collected leads are not deleted. The response names the page and the forms. No page token is returned. ${metaGraphNote}`,
      security: bearer,
      parameters: [{ name: 'pageId', in: 'path', required: true, description: 'Facebook Page id.', schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['formIds'],
              properties: { formIds: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', description: 'Numeric Facebook form id.' } } },
              example: { formIds: ['111222333444555'] },
            },
          },
        },
      },
      responses: {
        '200': ok('Forms connected.', {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Meta lead forms connected successfully' },
            selectedPage: { type: 'object', properties: { pageId: { type: 'string' }, pageName: { type: 'string' } } },
            forms: { type: 'array', items: { type: 'object', properties: { formId: { type: 'string' }, formName: { type: 'string' } } } },
          },
        }),
        '400': msg('Show `message`.', { message: 'Select at least one lead form' }),
        '404': msg('Page is not in this connection.', { message: 'Facebook Page not found in the Meta connection' }),
        '409': msg('Page is used by another workspace, or Meta must be reconnected.', { message: 'This Facebook Page is already connected to another workspace. Disconnect it there first.' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/leads/retry-failed': {
    post: {
      tags: ['Company'],
      operationId: 'companyRetryFailedMetaLeads',
      summary: 'Queue Meta leads that failed to download so the worker tries them again.',
      description: `${integrationWho} No body. Puts this company’s failed lead fetches back on the queue and wakes the worker. \`requeued\` is how many were queued. Already stored leads are not duplicated. ${metaGraphNote}`,
      security: bearer,
      responses: {
        '200': ok('Retry queued.', { type: 'object', properties: { message: { type: 'string', example: '2 lead(s) queued for retry' }, requeued: { type: 'integer' } } }, { message: '2 lead(s) queued for retry', requeued: 2 }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/sync': {
    post: {
      tags: ['Company'],
      operationId: 'companyStartMetaSync',
      summary: 'Import leads already submitted to the connected forms.',
      description: `${integrationWho} No body. The page and forms come from the saved connection. 409 \`{ message: "Meta is not connected" }\` when Facebook is not connected. 409 \`{ code: "META_RECONNECT_REQUIRED", message: "The Meta connection has expired or was revoked. Please reconnect Meta." }\` when a reconnect is needed. 400 "Select a Facebook Page and lead forms first" when nothing is selected.\n\n202 when a new job starts (\`alreadyRunning\` false). 200 when a job is already running (\`alreadyRunning\` true) and \`sync\` is that job. Poll GET …/sync/status. Meta only keeps leads for about 90 days. A 500 from this handler is \`{ message: "Server error starting the lead sync" }\`.`,
      security: bearer,
      responses: {
        '202': ok('A new sync was queued.', { type: 'object', properties: { alreadyRunning: { type: 'boolean', enum: [false] }, sync: metaSyncJob } }),
        '200': ok('A sync is already running. Use `sync` instead of starting another.', { type: 'object', properties: { alreadyRunning: { type: 'boolean', enum: [true] }, sync: metaSyncJob } }),
        '400': msg('No page or forms yet.', { message: 'Select a Facebook Page and lead forms first' }),
        '409': msg('Not connected, or the connection must be renewed.', { code: 'META_RECONNECT_REQUIRED', message: 'The Meta connection has expired or was revoked. Please reconnect Meta.' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta/sync/status': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetMetaSyncStatus',
      summary: 'Read the latest Meta lead sync and when the next automatic one runs.',
      description: `${integrationWho} \`sync\` is null when this company has never synced. \`autoSync.enabled\` is false when the server’s interval is 0. \`everyHours\` is that interval (3 unless the server sets META_AUTO_SYNC_HOURS). \`nextAt\` is when this company is next due, or null. Poll this while status is pending or processing. A 500 from this handler is \`{ message: "Server error retrieving the lead sync status" }\`.`,
      security: bearer,
      responses: {
        '200': ok('Latest job and the automatic schedule.', {
          type: 'object',
          properties: {
            sync: metaSyncJob,
            autoSync: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                everyHours: { type: 'number', description: '0 means automatic sync is off.' },
                nextAt: { ...iso, nullable: true },
              },
            },
          },
        }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/meta': {
    delete: {
      tags: ['Company'],
      operationId: 'companyDisconnectMeta',
      summary: 'Disconnect Facebook. Leads already stored are kept.',
      description: `${integrationWho} Clears the Facebook user, pages, forms, and stored tokens, and tries to unsubscribe the page from lead webhooks. App settings (App ID and secret) are kept. If Meta was not connected, the response is still 200 \`{ message: "Meta is not connected" }\`. On success the message is "Meta disconnected successfully". No token is returned. ${metaGraphNote}`,
      security: bearer,
      responses: {
        '200': msg('Disconnected, or it was already disconnected.', { message: 'Meta disconnected successfully' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/sheet': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetSheet',
      summary: 'Read the Google Sheet connection and the script to paste into it.',
      description: `${integrationWho} The first call creates the connection and a secret. \`script\` is the Apps Script source with that secret already filled in. Do not render \`script\` on a public page. The secret is not a separate field. \`connected\` is false until a web app URL is saved. A 500 from this handler is \`{ message: "Server error loading the Google Sheet connection" }\`.`,
      security: bearer,
      responses: {
        '200': ok('Sheet connection. Treat `script` as a credential.', sheetView),
        ...auth,
      },
    },
    put: {
      tags: ['Company'],
      operationId: 'companyConnectSheet',
      summary: 'Save the Apps Script web app URL and write the leads once.',
      description: `${integrationWho} Body \`webAppUrl\` must match an Apps Script web app address: https://script.google.com/macros/s/…/exec or the Workspace form https://script.google.com/a/macros/{domain}/s/…/exec. Otherwise 400 "Paste the Web app URL from Apps Script. It starts with https://script.google.com/ and ends with /exec."\n\nThe URL is kept only if a test write succeeds. Failure restores the previous URL and returns 400 \`{ message }\` with one of: "Google didn’t answer. Check the web app address and try again.", the Access denied paragraph (set Who has access to Anyone and deploy a new version), "Google can’t find this web app…", "Google returned a web page instead of the script’s answer…", "The sheet’s script has a different secret. Copy the script from this page again…", or "The sheet refused the update: …".\n\nSuccess is the sheet view plus \`message\` "Connected — {n} lead(s) written to your sheet". \`script\` in that body still contains the secret.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['webAppUrl'],
              properties: { webAppUrl: { type: 'string', description: 'Ends with /exec.' } },
              example: { webAppUrl: 'https://script.google.com/macros/s/AKfycbxExampleDeploymentId000000/exec' },
            },
          },
        },
      },
      responses: {
        '200': ok('Connected. `script` still contains the secret.', sheetView),
        '400': msg('The URL was rejected or the sheet did not accept the write.', { message: 'Paste the Web app URL from Apps Script. It starts with https://script.google.com/ and ends with /exec.' }),
        ...auth,
      },
    },
    delete: {
      tags: ['Company'],
      operationId: 'companyDisconnectSheet',
      summary: 'Stop writing to the sheet. Rows already in the sheet stay.',
      description: `${integrationWho} Clears the web app URL, connectedAt, and the last error. The secret and \`script\` remain, so the same script still matches until you mint a new secret. The response is the sheet view with connected false. \`script\` still contains the secret.`,
      security: bearer,
      responses: {
        '200': ok('Disconnected. `script` still contains the secret.', sheetView),
        ...auth,
      },
    },
  },
  '/api/company/integrations/sheet/sync': {
    post: {
      tags: ['Company'],
      operationId: 'companySyncSheet',
      summary: 'Write this company’s leads to the sheet now.',
      description: `${integrationWho} No body. 409 \`{ message: "Connect your Google Sheet first" }\` when no web app URL is saved. A failed write is 400 and the body is the sheet view plus \`message\` (the same Google errors as connect). Success is the sheet view plus \`message\` "{n} lead(s) written to your sheet". \`script\` contains the secret.`,
      security: bearer,
      responses: {
        '200': ok('Written. `message` says how many leads.', sheetView),
        '400': ok('The write failed. The body is the sheet view (including `script`) plus `message`. Show `message`.', sheetView, { connected: true, webAppUrl: 'https://script.google.com/macros/s/example/exec', message: 'The sheet’s script has a different secret. Copy the script from this page again, paste it over the old one and deploy a new version.' }),
        '409': msg('No URL saved yet.', { message: 'Connect your Google Sheet first' }),
        ...auth,
      },
    },
  },
  '/api/company/integrations/sheet/secret': {
    post: {
      tags: ['Company'],
      operationId: 'companyRenewSheetSecret',
      summary: 'Mint a new sheet secret. The script already in the spreadsheet stops working.',
      description: `${integrationWho} No body. Replaces the secret and returns the sheet view. \`script\` contains the new secret. The admin must paste that script over the old one and deploy a new version before the next sync will succeed. Do not render \`script\` on a public page. The previous secret stops matching immediately.`,
      security: bearer,
      responses: {
        '200': ok('New script. Treat `script` as a credential.', sheetView),
        ...auth,
      },
    },
  },
  '/api/company/google-leads/status': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetGoogleAdsStatus',
      summary: 'Say whether any Google Ads lead has ever been stored.',
      description: `${integrationWho} \`connected\` is true when this company has at least one Google Ads lead row, including test and imported rows. It does not mean a webhook key exists. Use GET …/integration for the key and the counts. A 500 from this handler is \`{ message: "Server error loading Google Ads status" }\`.`,
      security: bearer,
      responses: {
        '200': ok('Whether any lead row exists.', { type: 'object', properties: { connected: { type: 'boolean' } } }, { connected: false }),
        ...auth,
      },
    },
  },
  '/api/company/google-leads/integration': {
    get: {
      tags: ['Company'],
      operationId: 'companyGetGoogleAdsIntegration',
      summary: 'Read the Google Ads webhook key, counts, and forms seen so far.',
      description: `${integrationWho} \`webhookKey\` is the google_key in plaintext. Show it only on this settings screen so the admin can paste it into Google Ads. Do not render it on a public page. \`keySource\` \`env\` means the key is the server-wide key and is still returned. \`none\` means webhookKey is "". \`connected\` here is stricter than GET …/status: a key must exist and a live or test lead (not an imported file) must have arrived. At most 50 forms are listed. A 500 from this handler is \`{ message: "Server error loading Google Ads integration" }\`.`,
      security: bearer,
      responses: {
        '200': ok('Key and counts. Do not publish webhookKey.', googleIntegration),
        ...auth,
      },
    },
  },
  '/api/company/google-leads/integration/key': {
    post: {
      tags: ['Company'],
      operationId: 'companyCreateGoogleAdsKey',
      summary: 'Create a Google Ads webhook key. The previous key stops working immediately.',
      description: `${integrationWho} No body. Generates a new key, stores it encrypted, and returns the integration object. \`webhookKey\` is the new google_key in plaintext. Show it once on this settings screen so it can be pasted into the Google Ads lead form webhook. Do not put it on a public page. Any key this company had before, including one just shown, no longer matches. A 500 from this handler is \`{ message: "Server error creating the webhook key" }\`.`,
      security: bearer,
      responses: {
        '200': ok('The integration, including the new webhookKey.', googleIntegration),
        ...auth,
      },
    },
    delete: {
      tags: ['Company'],
      operationId: 'companyDeleteGoogleAdsKey',
      summary: 'Remove this company’s Google Ads webhook key. Leads already stored are kept.',
      description: `${integrationWho} Deletes the key this screen created. Google can no longer post leads with that key. If the server has GOOGLE_ADS_WEBHOOK_KEY, the response still includes that environment key and keySource "env". Otherwise webhookKey is "" and keySource is "none". Leads are not deleted. A 500 from this handler is \`{ message: "Server error disconnecting Google Ads" }\`.`,
      security: bearer,
      responses: {
        '200': ok('The integration after the key was removed. An environment key, if the server has one, is still in webhookKey.', googleIntegration),
        ...auth,
      },
    },
  },
  '/api/company/google-leads/import': {
    post: {
      tags: ['Company'],
      operationId: 'companyImportGoogleAdsLeads',
      summary: 'Import leads from the CSV or Excel file downloaded from Google Ads.',
      description: `${integrationWho} Multipart field name is \`file\`. The file name must end in .csv, .xlsx, or .xls. Anything else is 400 \`{ message: "Upload the CSV or Excel file downloaded from Google Ads" }\`. Over 5 MB is 400 \`{ message: "The file must be 5 MB or smaller" }\`. These upload errors use \`message\`, not \`error\`.\n\nOther 400 messages: "Choose the leads file downloaded from Google Ads", "Could not read this file. Upload the CSV downloaded from Google Ads.", "The file is empty", "The file has no leads", "No name, email or phone column was found. Upload the leads file downloaded from Google Ads.", "The file has {n} leads. Upload at most 5000 at a time."\n\nRows that are already stored (including ones a webhook saved while the file uploaded) are counted in alreadyInCrm and skipped. Empty rows are \`skipped\`. New rows are inserted. The response is message, imported, alreadyInCrm, and skipped. The google_key is not in this response.`,
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: {
                file: { type: 'string', format: 'binary', description: 'Form field name `file`. CSV, XLSX, or XLS from Google Ads. At most 5 MB and 5000 data rows.' },
              },
            },
          },
        },
      },
      responses: {
        '200': ok('Import result.', {
          type: 'object',
          properties: {
            message: { type: 'string', example: '12 lead(s) imported, 3 already in the CRM, 1 empty row(s) skipped' },
            imported: { type: 'integer' },
            alreadyInCrm: { type: 'integer' },
            skipped: { type: 'integer', description: 'Empty rows in the file.' },
          },
        }, { message: '12 lead(s) imported, 3 already in the CRM', imported: 12, alreadyInCrm: 3, skipped: 0 }),
        '400': msg('Show `message`. This is not the shared validation body.', { message: 'Choose the leads file downloaded from Google Ads' }),
        ...auth,
      },
    },
  },
};
