/** Shared OpenAPI pieces. Path files may $ref these responses; they must not edit this file. */

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string', description: 'Message safe to show to the user.' },
    code: { type: 'string', description: 'Machine-readable code when the handler set one (VALIDATION, RATE_LIMITED, and a few domain codes).' },
    details: { type: 'object', description: 'Extra data for the client. Validation errors put per-field messages in details.fields.', additionalProperties: true },
  },
};

const errorResponse = (description, example) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example } },
});

export const components = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Token returned by POST /api/auth/login as `token`. Send `Authorization: Bearer <token>` on every call that is not marked public. The token is tied to one device session (`sid`). Changing the password, signing out, or exceeding the device limit invalidates it. A 401 means: clear the token and send the user to sign in. The `error` string is the message to show.',
    },
  },
  schemas: {
    Error: errorSchema,
    ObjectId: {
      type: 'string',
      pattern: '^[a-fA-F0-9]{24}$',
      description: 'MongoDB document id. 24 hexadecimal characters. Send it as a string, never as an object.',
      example: '665f1c2a3b4d5e6f7a8b9c0d',
    },
  },
  parameters: {
    Id: {
      name: 'id',
      in: 'path',
      required: true,
      description: 'MongoDB id of the record (24 hex characters).',
      schema: { $ref: '#/components/schemas/ObjectId' },
    },
  },
  responses: {
    ValidationError: errorResponse('The JSON body failed validation. Show `error` (the first problem) and use `details.fields` to mark each input. Keys are dotted paths such as `referredBy.phone`. Unknown extra fields are not an error: the schema is loose, and the service ignores fields it does not read.', {
      error: 'Email is required',
      code: 'VALIDATION',
      details: { fields: { email: 'Email is required' } },
    }),
    Unauthorized: errorResponse('Missing, expired, or revoked token. Send the user to sign in. Do not retry the same token.', {
      error: 'Your session has expired. Sign in again.',
    }),
    Forbidden: errorResponse('The token is valid but this user cannot do this. Staff are missing a permission, or a branch user tried to edit a company-wide master. Show `error`.', {
      error: 'You do not have access to this area',
    }),
    NotFound: errorResponse('No record with that id in this company (or the public token is unknown).', {
      error: 'Record not found',
    }),
    Conflict: errorResponse('The write clashes with data already stored (duplicate value, or someone else saved the same record). Show `error` and reload.', {
      error: 'That value is already in use',
    }),
    RateLimited: errorResponse('Too many requests. Wait `Retry-After` seconds (also reflected in the message). Response headers: `RateLimit-Limit`, `RateLimit-Remaining`, `Retry-After`.', {
      error: 'Too many requests. Try again in 30 seconds.',
      code: 'RATE_LIMITED',
    }),
    ServerError: errorResponse('Unexpected failure. Show a generic message; the body is always this.', {
      error: 'Internal server error',
    }),
  },
};

export const tags = [
  { name: 'Auth', description: 'Sign in, the current session, profile, password, branch switch, sign out.' },
  { name: 'Public', description: 'No token. Shared proposals, the marketing free-proposal form, and the contact form.' },
  { name: 'Files', description: 'Short-lived links for protected uploads, and the /uploads file stream.' },
  { name: 'Notifications', description: 'The signed-in user inbox (company owner or staff).' },
  { name: 'Webhooks', description: 'Called by Meta or Google, not by the app. Authenticated by their own signatures or keys, not by a user token.' },
  { name: 'Admin', description: 'Platform super admin only (`role: superadmin`).' },
  { name: 'Organization', description: 'The company above branches: branches, org profile, shared masters. Company admin (`role: company`).' },
  { name: 'Company', description: 'The signed-in branch workspace: profile, branding, subscription, plan request, and lead-source connections (Meta, Google Ads, Google Sheet).' },
  { name: 'Clients', description: 'Customer records for the signed-in company.' },
  { name: 'Staff', description: 'Staff accounts (role `agent`) and who they are. Only a branch owner or company admin manages accounts.' },
  { name: 'Roles', description: 'Named permission sets assigned to staff.' },
  { name: 'Portal', description: 'The client login (`role: client`): their proposals, decisions, tickets, AMC requests.' },
  { name: 'Support tickets', description: 'A company talking to the platform (Innovbit) support team.' },
  { name: 'Client tickets', description: 'A company talking to its own clients. The client side is under Portal.' },
  { name: 'Designs', description: 'Solar proposals: site, layout, pricing, share link, versions, client review.' },
  { name: 'Estimates', description: 'Quick quotes saved from the dashboard, not full proposals.' },
  { name: 'Catalog', description: 'Read-only bundle the designer and the catalog page use (categories, products, packages, charges).' },
  { name: 'Categories', description: 'Product categories and parent categories. Shared by every branch of the company.' },
  { name: 'Products', description: 'Sellable equipment (panels, inverters, and the rest of the catalog).' },
  { name: 'Packages', description: 'Pre-built kits of products the designer can drop onto a proposal.' },
  { name: 'Installation charges', description: 'Labour / installation charge rows used in proposal pricing.' },
  { name: 'Solar', description: 'Google Solar, satellite map, and roof detection. These calls cost money and are rate limited.' },
  { name: 'Billing', description: 'Invoices, bills, receipts, credit notes, and e-way bills for the signed-in company.' },
  { name: 'Stock', description: 'Purchase batches and serial units.' },
  { name: 'Suppliers', description: 'Vendors stock is bought from.' },
  { name: 'Expenses', description: 'Money spent delivering a proposal’s installation, plus the expense-reason list.' },
  { name: 'Projects', description: 'Installations created from won proposals: steps, notes, photos, AMC visits.' },
  { name: 'Loans', description: 'Loan files on proposals, and the company’s loan-step template.' },
  { name: 'Subsidies', description: 'Subsidy files on proposals, and the company’s subsidy-step template.' },
  { name: 'Dashboard', description: 'Home-screen counts and today’s work for a branch owner or company admin.' },
  { name: 'Leads', description: 'Manual, Meta, and Google leads: lists, board, assignment, status, import, export, reports.' },
];
