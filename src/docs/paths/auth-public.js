// OpenAPI paths for auth, public, health, uploads, files, notifications, and inbound webhooks.
// Loaded by backend/src/docs/spec.js. No imports. Success JSON is the value itself, never `{ data }`.

const oid = { $ref: '#/components/schemas/ObjectId' };
const err = { $ref: '#/components/schemas/Error' };
const ValidationError = { $ref: '#/components/responses/ValidationError' };
const Unauthorized = { $ref: '#/components/responses/Unauthorized' };
const Forbidden = { $ref: '#/components/responses/Forbidden' };
const NotFound = { $ref: '#/components/responses/NotFound' };
const Conflict = { $ref: '#/components/responses/Conflict' };
const RateLimited = { $ref: '#/components/responses/RateLimited' };
const ServerError = { $ref: '#/components/responses/ServerError' };

const json = (description, schema, example) => ({
  description,
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } },
});

const API_LIMIT = 'Also counts toward the API-wide limit of 1500 requests per IP per 5 minutes. That 429 body is `{ "error": "Too many requests. Try again in <seconds> seconds.", "code": "RATE_LIMITED" }` with header `Retry-After`.';
const PUBLIC_LIMIT = 'The `/api/public` mount allows 400 requests per IP per 10 minutes, before the route\'s own limit. ' + API_LIMIT;
const AUTH_401 = [
  'Missing or rejected bearer token is 401. Show `error` and go to sign-in.',
  'Messages from the auth middleware: "Sign in to continue" (no `Authorization: Bearer` token); "Your session has expired. Sign in again." (bad or expired JWT); "Account no longer exists"; "Your password was changed. Sign in again."; "This admin session is no longer valid."; "This admin session has ended." (impersonation); "Your session is outdated. Sign in again on this device." (tenant token with no session id); "This device was signed out. Sign in again, or free a slot by signing out on another device."; "You were signed out. Sign in again."; "This account has been deactivated" (agent or client); "No branch is available for this account."; "Company no longer exists"; "This sign-in is no longer valid." (company-admin token on an organization that has no branches).',
  'A suspended branch or organization is 403 "This company account is suspended. Contact the platform administrator." A token whose branch is outside the user\'s organization is 403 "You do not have access to this area".',
].join(' ');

const theme = {
  type: 'object',
  description: 'Brand colours. Each value is `#` plus 6 hex digits.',
  properties: {
    primary: { type: 'string', example: '#1d4ed8' },
    accent: { type: 'string', example: '#f59e0b' },
  },
};

const companyFeatures = {
  type: 'object',
  description: 'Plan flags copied onto the branch.',
  properties: {
    pdfBranding: { type: 'boolean', description: 'When true, logo, colours, signature and QR are printed on PDFs.' },
    excelImport: { type: 'boolean', description: 'When true, catalog Excel import is allowed.' },
  },
};

const subscriptionStatus = { type: 'string', enum: ['none', 'active', 'cancelled'] };

const permissionsEnum = [
  'leads:view', 'leads:view_team', 'leads:view_all', 'leads:create', 'leads:change_status', 'leads:update', 'leads:assign', 'leads:export',
  'proposals:view', 'proposals:create', 'proposals:update', 'proposals:change_status', 'proposals:change_client', 'proposals:share', 'proposals:delete',
  'clients:view', 'clients:view_team', 'clients:create', 'clients:update', 'clients:manage_login', 'clients:delete',
  'finances:view', 'finances:create_eway_bill', 'finances:create_bill', 'finances:create_invoice',
  'inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete',
  'tasks:view', 'tasks:view_team', 'tasks:create', 'tasks:update', 'tasks:assign', 'tasks:change_status', 'tasks:invoice_parts', 'tasks:delete',
  'support:view', 'support:create', 'support:update',
  'helpdesk:view', 'helpdesk:update',
  'expenses:view', 'expenses:create', 'expenses:update', 'expenses:delete',
  'loans:view', 'loans:update',
  'subsidies:view', 'subsidies:update',
];

const userSchema = {
  type: 'object',
  description: 'The user document (`id` instead of `_id`, no `passwordHash`). `managesMasters` and `editsCatalog` are added by the session builder and are absent for `superadmin` and `client`. For `agent`, `permissions` is replaced with the effective set (named roles plus grants on the account). For every other role, `permissions` is the stored grant list, usually empty: a branch owner and a company admin are not checked against it.',
  required: ['id', 'email', 'role'],
  properties: {
    id: oid,
    email: { type: 'string', format: 'email', example: 'branch.pune@sunrisesolar.in' },
    role: { type: 'string', enum: ['superadmin', 'company', 'branch', 'agent', 'client'], description: '`superadmin` is the platform console. `company` is the organization admin and works in one branch at a time. `branch` is the owner of one branch. `agent` is staff. `client` is the customer portal.' },
    name: { type: 'string', example: 'Anita Sharma', description: 'Display name. May be an empty string.' },
    company: { description: 'Active branch id. Null for a super admin.', nullable: true, allOf: [oid] },
    organization: { description: 'Organization id. Null when this login has no organization.', nullable: true, allOf: [oid] },
    client: { description: 'Client record id when `role` is `client`. Otherwise null.', nullable: true, allOf: [oid] },
    manager: { description: 'Staff manager user id (agents only). Otherwise null.', nullable: true, allOf: [oid] },
    phone: { type: 'string', example: '9820012345', description: 'Stored phone. An Indian mobile is 10 digits; other countries keep a leading + and country code. May be empty.' },
    jobTitle: { type: 'string', description: 'Legacy single job title. Prefer `roles`.' },
    roles: { type: 'array', items: { type: 'string' }, description: 'Job titles used to match installation steps (for example Electrician). Not permissions.', example: ['Electrician'] },
    staffRoles: { type: 'array', items: oid, description: 'Role document ids whose permissions are granted to this agent.' },
    permissions: { type: 'array', items: { type: 'string', enum: permissionsEnum }, description: 'See the object description: effective permissions for an agent, stored grants otherwise.' },
    permissionsVersion: { type: 'integer', example: 6, description: 'Permission-name version stored on the account. The current version is 6.' },
    photo: { type: 'string', description: 'Public avatar path `/uploads/<name>`, or empty.', example: '' },
    active: { type: 'boolean', description: 'Inactive agents and clients cannot sign in.' },
    lastLoginAt: { type: 'string', format: 'date-time', description: 'Set on each successful sign-in. Absent until the first one.' },
    tokenVersion: { type: 'integer', description: 'Bumped when the password changes. Older tokens then fail with 401.' },
    managesMasters: { type: 'boolean', description: 'Present for `company` and `branch` only. True when this user edits shared masters (the company admin, or the branch owner of an organization that has no branches).' },
    editsCatalog: { type: 'boolean', description: 'Present for `company`, `branch`, and `agent`. True when this user may change the shared product catalog. False for an agent or branch owner when the organization has branches (only the company admin edits it).' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const organizationSchema = {
  type: 'object',
  nullable: true,
  description: 'The company above the branches. Null for a super admin and for a login that has no organization. Only these fields are returned.',
  properties: {
    id: oid,
    name: { type: 'string', example: 'Sunrise Solar Pvt Ltd' },
    email: { type: 'string', example: 'hello@sunrisesolar.in' },
    phone: { type: 'string', example: '9820012345' },
    status: { type: 'string', enum: ['active', 'suspended'] },
    limits: {
      type: 'object',
      properties: {
        maxConcurrentLogins: { type: 'integer', description: 'Stored on the organization. The live device cap enforced at sign-in is 1 (see login 403 `DEVICE_LIMIT`).', example: 2 },
        maxBranches: { type: 'integer', example: 3 },
        maxClients: { type: 'integer', description: 'Clients counted across every branch.', example: 100 },
        maxDesigns: { type: 'integer', description: 'Proposals counted across every branch.', example: 200 },
      },
    },
    subscription: {
      type: 'object',
      properties: {
        periodStart: { type: 'string', format: 'date-time', nullable: true },
        periodEnd: { type: 'string', format: 'date-time', nullable: true },
        status: subscriptionStatus,
        billingCycle: { type: 'string', example: 'monthly' },
        cancelAtPeriodEnd: { type: 'boolean' },
      },
    },
    features: companyFeatures,
    theme: theme,
    logo: { type: 'string', description: 'Public upload path `/uploads/<name>`, or empty.', example: '/uploads/logo-sunrise.png' },
    hasBranches: { type: 'boolean', description: 'Chosen when the organization was created and never changed. False means one branch and no company-admin login.' },
  },
};

const stepPriority = { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] };

const installationStep = {
  type: 'object',
  properties: {
    id: oid,
    name: { type: 'string', example: 'Structure installation' },
    description: { type: 'string' },
    role: { type: 'string', description: 'Job title from `agentRoles` that should do this step.', example: 'Installer' },
    priority: stepPriority,
  },
};

const namedStep = {
  type: 'object',
  description: 'Loan or subsidy template step.',
  properties: {
    id: oid,
    name: { type: 'string', example: 'Documents collected' },
    description: { type: 'string' },
  },
};

const amcTemplate = {
  type: 'object',
  properties: {
    id: oid,
    name: { type: 'string', example: 'First year service' },
    daysAfterInstallation: { type: 'integer', nullable: true, description: 'Days after installation completion. Null when unset.' },
    kind: { type: 'string', enum: ['mandatory', 'optional'] },
    price: { type: 'number', description: 'Price in the company currency. 0 for a free visit.', example: 0 },
    description: { type: 'string', description: 'Sanitised HTML, or empty.' },
    criteria: { type: 'array', items: { type: 'string' }, description: 'Up to 40 short lines.' },
  },
};

const leadFormField = {
  type: 'object',
  description: 'Custom field on the company lead form, after the fixed Name / Phone / Address. These embedded fields have no `id`.',
  properties: {
    key: { type: 'string', example: 'consumer_number' },
    label: { type: 'string', example: 'Consumer number' },
    type: { type: 'string', enum: ['text', 'textarea', 'number', 'phone', 'email', 'select', 'multiselect', 'date', 'yesno'] },
    required: { type: 'boolean' },
    help: { type: 'string' },
    options: { type: 'array', items: { type: 'string' }, description: 'Choices for `select` and `multiselect`.' },
  },
};

const billingSchema = {
  type: 'object',
  description: 'Subscription summary added for a branch owner and a company admin. Not included for agents or clients.',
  properties: {
    plan: {
      nullable: true,
      description: 'Null when the branch has no plan reference.',
      type: 'object',
      properties: {
        id: oid,
        code: { type: 'string', example: 'pro' },
        name: { type: 'string', example: 'Pro' },
        description: { type: 'string' },
        kind: { type: 'string', enum: ['fixed', 'custom'] },
        priceMonthly: { type: 'number', example: 4999 },
        maxConcurrentLogins: { type: 'integer', example: 1 },
        maxBranches: { type: 'integer', example: 3 },
        maxClients: { type: 'integer', example: 100 },
        maxDesigns: { type: 'integer', example: 200 },
        features: { type: 'array', items: { type: 'string' }, description: 'Marketing lines for the plan. This is not the `features` object on the company.' },
        selfServe: { type: 'boolean' },
        active: { type: 'boolean' },
      },
    },
    limits: {
      type: 'object',
      properties: {
        maxConcurrentLogins: { type: 'integer', description: 'Cap from the plan, or from the branch when the plan is custom or missing.', example: 1 },
      },
    },
    companyLimits: {
      type: 'object',
      description: 'Organization-wide caps.',
      properties: {
        maxBranches: { type: 'integer', example: 3 },
        maxClients: { type: 'integer', nullable: true, example: 100 },
        maxDesigns: { type: 'integer', nullable: true, example: 200 },
      },
    },
    subscription: {
      type: 'object',
      properties: {
        periodStart: { type: 'string', format: 'date-time', nullable: true },
        periodEnd: { type: 'string', format: 'date-time', nullable: true },
        daysRemaining: { type: 'integer', nullable: true, description: 'Whole days until `periodEnd`, or null when there is no end date. Never negative.' },
        status: subscriptionStatus,
        billingCycle: { type: 'string', example: 'monthly' },
        cancelAtPeriodEnd: { type: 'boolean' },
      },
    },
    renewal: {
      type: 'object',
      properties: {
        nextAmount: { type: 'number', description: 'Plan monthly price, or 0 when there is no plan.', example: 4999 },
        nextDate: { type: 'string', format: 'date-time', nullable: true },
        daysRemaining: { type: 'integer', nullable: true },
        billingCycle: { type: 'string', example: 'monthly' },
        cancelAtPeriodEnd: { type: 'boolean' },
      },
    },
  },
};

const ownerCompany = {
  type: 'object',
  description: 'Returned when `user.role` is `company` or `branch`. Shared masters (theme, steps, units, lead form, tax, currency) come from the organization and are overlaid onto this branch. `organization` itself is not a field here; it is the sibling `organization` object.',
  properties: {
    id: oid,
    name: { type: 'string', example: 'Sunrise Solar — Pune HQ' },
    email: { type: 'string', example: 'hello@sunrisesolar.in' },
    phone: { type: 'string', example: '9820012345' },
    alternatePhone: { type: 'string' },
    address: { type: 'string', example: '214 Business Park, Baner Road, Pune, Maharashtra 411045' },
    website: { type: 'string', example: 'www.sunrisesolar.in' },
    taxId: { type: 'string', description: 'GSTIN or other tax number.', example: '27AAACS1234F1Z5' },
    pan: { type: 'string', example: 'AAACS1234F' },
    status: { type: 'string', enum: ['active', 'suspended'] },
    limits: { type: 'object', properties: { maxConcurrentLogins: { type: 'integer', example: 1 } } },
    subscription: {
      type: 'object',
      description: 'Raw subscription dates on the branch. The screen summary is `billing`.',
      properties: {
        periodStart: { type: 'string', format: 'date-time', nullable: true },
        periodEnd: { type: 'string', format: 'date-time', nullable: true },
        status: subscriptionStatus,
        billingCycle: { type: 'string', example: 'monthly' },
        cancelAtPeriodEnd: { type: 'boolean' },
      },
    },
    features: companyFeatures,
    theme: theme,
    logo: { type: 'string', description: 'Public `/uploads/...` path, or empty.' },
    signature: { type: 'string', description: 'Public `/uploads/...` path of the signatory image, or empty.' },
    qr: { type: 'string', description: 'Public `/uploads/...` path of the proposal QR, or empty.' },
    signatoryName: { type: 'string', example: 'Anita Sharma' },
    signatoryTitle: { type: 'string', example: 'Director' },
    qrLabel: { type: 'string', example: 'Scan to pay / contact us' },
    tagline: { type: 'string', example: 'Clean energy for a brighter tomorrow' },
    pdfTerms: { type: 'string', description: 'Sanitised HTML printed on the proposal PDF. May be empty.' },
    bankAccountName: { type: 'string' },
    bankName: { type: 'string' },
    bankAccountNumber: { type: 'string' },
    bankIfsc: { type: 'string' },
    bankBranch: { type: 'string' },
    bankAccountType: { type: 'string', description: 'Free text, for example Savings or Current.' },
    upiId: { type: 'string' },
    paymentQr: { type: 'string', description: 'Public `/uploads/...` path of the UPI QR, or empty. Separate from `qr`.' },
    paymentQrLabel: { type: 'string', example: 'Scan to pay with any UPI app' },
    installationSteps: { type: 'array', items: installationStep },
    amcTemplates: { type: 'array', items: amcTemplate },
    loanSteps: { type: 'array', items: namedStep },
    subsidySteps: { type: 'array', items: namedStep },
    expenseReasons: { type: 'array', items: { type: 'string' }, example: ['Transport of material', 'Labour charges', 'Material purchase'] },
    currency: { type: 'string', example: 'INR', description: 'Currency code used for amounts.' },
    taxLabel: { type: 'string', example: 'GST', description: 'Name printed next to the tax. Not an enum.' },
    taxRate: { type: 'number', example: 18, description: 'Default tax percent for new items. 0 to 100.' },
    tariff: { type: 'number', example: 8, description: 'Electricity tariff used by the designer.' },
    otherCostPerKw: { type: 'number', example: 0, description: 'Stored value. Proposals price catalog products only.' },
    productUnits: { type: 'array', items: { type: 'string' }, example: ['Nos', 'Piece', 'Set', 'Metre'] },
    agentRoles: { type: 'array', items: { type: 'string' }, example: ['Site surveyor', 'Electrician', 'Installer', 'Supervisor', 'Inspector'] },
    leadForm: { type: 'array', items: leadFormField },
    invoiceNumbering: {
      type: 'object',
      properties: {
        prefix: { type: 'string', example: 'INV-' },
        width: { type: 'integer', example: 4, description: 'Minimum digits. The number is padded, never wrapped.' },
        next: { type: 'integer', nullable: true, description: 'Next sequence stored on the branch. Null means the legacy counter is still in use.' },
        nextInvoiceNo: { type: 'string', example: 'INV-0007', description: 'The number the next invoice will get. Nothing is reserved by reading this.' },
      },
    },
    proposalNumbering: {
      type: 'object',
      description: 'Always present. Companies saved before this existed read as the defaults plus `nextProposalNo`.',
      properties: {
        prefix: { type: 'string', example: 'PRO-' },
        suffix: { type: 'string', example: '' },
        width: { type: 'integer', example: 4 },
        next: { type: 'integer', example: 1 },
        nextProposalNo: { type: 'string', example: 'PRO-0001', description: 'prefix + next padded to width + suffix.' },
      },
    },
    billing: billingSchema,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const agentCompany = {
  type: 'object',
  description: 'Returned when `user.role` is `agent`. Only these fields.',
  properties: {
    id: oid,
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    logo: { type: 'string' },
    theme: theme,
    currency: { type: 'string', example: 'INR' },
    taxLabel: { type: 'string', example: 'GST' },
    taxRate: { type: 'number', example: 18 },
    tariff: { type: 'number', example: 8 },
    otherCostPerKw: { type: 'number', example: 0 },
    productUnits: { type: 'array', items: { type: 'string' } },
    expenseReasons: { type: 'array', items: { type: 'string' } },
    features: companyFeatures,
  },
};

const clientCompany = {
  type: 'object',
  description: 'Returned when `user.role` is `client`. Bank and branding fields the portal and PDFs show. No masters, no billing.',
  properties: {
    id: oid,
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    alternatePhone: { type: 'string' },
    address: { type: 'string' },
    website: { type: 'string' },
    taxId: { type: 'string' },
    logo: { type: 'string' },
    signature: { type: 'string' },
    qr: { type: 'string' },
    qrLabel: { type: 'string' },
    bankAccountName: { type: 'string' },
    bankName: { type: 'string' },
    bankAccountNumber: { type: 'string' },
    bankIfsc: { type: 'string' },
    bankBranch: { type: 'string' },
    bankAccountType: { type: 'string' },
    upiId: { type: 'string' },
    paymentQr: { type: 'string' },
    paymentQrLabel: { type: 'string' },
    tagline: { type: 'string' },
    signatoryName: { type: 'string' },
    signatoryTitle: { type: 'string' },
    theme: theme,
    currency: { type: 'string' },
    taxLabel: { type: 'string' },
    taxRate: { type: 'number' },
    pdfTerms: { type: 'string', description: 'Sanitised HTML.' },
    features: companyFeatures,
  },
};

const companySchema = {
  nullable: true,
  description: 'Null for a super admin. Otherwise one of the three shapes: agent view, client view, or owner view (`company` and `branch`).',
  oneOf: [agentCompany, clientCompany, ownerCompany],
};

const sessionCore = {
  user: userSchema,
  company: companySchema,
  organization: organizationSchema,
};

const sessionWithFlag = {
  type: 'object',
  required: ['user', 'company', 'organization', 'impersonated'],
  properties: {
    ...sessionCore,
    impersonated: { type: 'boolean', description: 'True when a platform admin is signed in as this user (the JWT contains `by`). Login always returns false. Profile and `/me` return the real flag.' },
  },
};

const loginResponse = {
  type: 'object',
  required: ['token', 'user', 'company', 'organization', 'impersonated'],
  properties: {
    token: { type: 'string', description: 'JWT. Send as `Authorization: Bearer <token>`. Lifetime is `JWT_EXPIRES` (default 7 days). Tied to one device session. Store this value; it is not readable from the session later.' },
    ...sessionCore,
    impersonated: { type: 'boolean', enum: [false], description: 'Always false on this route. Impersonation is started from the admin console, not from login.' },
  },
};

const branchResponse = {
  type: 'object',
  required: ['token', 'user', 'company', 'organization'],
  description: 'Same session fields as login, without `impersonated`. Replace the stored token with `token` (it carries the new branch id).',
  properties: {
    token: { type: 'string', description: 'New JWT for the selected branch. The previous token was for the old branch.' },
    ...sessionCore,
  },
};

const loginExample = {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjVmMWMyYTNiNGQ1ZTZmN2E4YjljMGQiLCJyb2xlIjoiYnJhbmNoIn0.signature',
  impersonated: false,
  user: {
    id: '665f1c2a3b4d5e6f7a8b9c0d',
    email: 'branch.pune@sunrisesolar.in',
    role: 'branch',
    name: 'Anita Sharma',
    company: '665f1c2a3b4d5e6f7a8b9c11',
    organization: '665f1c2a3b4d5e6f7a8b9c22',
    client: null,
    manager: null,
    phone: '9820012345',
    jobTitle: '',
    roles: [],
    staffRoles: [],
    permissions: [],
    permissionsVersion: 6,
    photo: '',
    active: true,
    lastLoginAt: '2026-11-23T07:30:00.000Z',
    tokenVersion: 0,
    managesMasters: false,
    editsCatalog: false,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-11-23T07:30:00.000Z',
  },
  company: {
    id: '665f1c2a3b4d5e6f7a8b9c11',
    name: 'Sunrise Solar — Pune HQ',
    email: 'hello@sunrisesolar.in',
    phone: '9820012345',
    alternatePhone: '',
    address: '214 Business Park, Baner Road, Pune, Maharashtra 411045',
    website: 'www.sunrisesolar.in',
    taxId: '27AAACS1234F1Z5',
    pan: '',
    status: 'active',
    limits: { maxConcurrentLogins: 1 },
    subscription: { periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z', status: 'active', billingCycle: 'monthly', cancelAtPeriodEnd: false },
    features: { pdfBranding: true, excelImport: true },
    theme: { primary: '#1d4ed8', accent: '#f59e0b' },
    logo: '/uploads/logo-sunrise.png',
    signature: '',
    qr: '',
    signatoryName: 'Anita Sharma',
    signatoryTitle: 'Director',
    qrLabel: 'Scan to pay / contact us',
    tagline: 'Clean energy for a brighter tomorrow',
    pdfTerms: '',
    bankAccountName: 'Sunrise Solar Pvt Ltd',
    bankName: 'HDFC Bank',
    bankAccountNumber: '50200012345678',
    bankIfsc: 'HDFC0001234',
    bankBranch: 'Baner',
    bankAccountType: 'Current',
    upiId: 'sunrise@hdfcbank',
    paymentQr: '',
    paymentQrLabel: 'Scan to pay with any UPI app',
    installationSteps: [{ id: '665f1c2a3b4d5e6f7a8b9c31', name: 'Structure installation', description: '', role: 'Installer', priority: 'medium' }],
    amcTemplates: [],
    loanSteps: [],
    subsidySteps: [{ id: '665f1c2a3b4d5e6f7a8b9c32', name: 'Documents collected', description: 'Aadhaar, electricity bill, bank account details and roof ownership proof.' }],
    expenseReasons: ['Transport of material', 'Labour charges', 'Material purchase'],
    currency: 'INR',
    taxLabel: 'GST',
    taxRate: 18,
    tariff: 8,
    otherCostPerKw: 0,
    productUnits: ['Nos', 'Piece', 'Set', 'Metre'],
    agentRoles: ['Site surveyor', 'Electrician', 'Installer', 'Supervisor', 'Inspector'],
    leadForm: [],
    invoiceNumbering: { prefix: 'INV-', width: 4, next: 7, nextInvoiceNo: 'INV-0007' },
    proposalNumbering: { prefix: 'PRO-', suffix: '', width: 4, next: 12, nextProposalNo: 'PRO-0012' },
    billing: {
      plan: { id: '665f1c2a3b4d5e6f7a8b9c40', code: 'pro', name: 'Pro', description: '', kind: 'fixed', priceMonthly: 4999, maxConcurrentLogins: 1, maxBranches: 3, maxClients: 100, maxDesigns: 200, features: [], selfServe: true, active: true },
      limits: { maxConcurrentLogins: 1 },
      companyLimits: { maxBranches: 3, maxClients: 100, maxDesigns: 200 },
      subscription: { periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z', daysRemaining: 8, status: 'active', billingCycle: 'monthly', cancelAtPeriodEnd: false },
      renewal: { nextAmount: 4999, nextDate: '2026-12-01T00:00:00.000Z', daysRemaining: 8, billingCycle: 'monthly', cancelAtPeriodEnd: false },
    },
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  organization: {
    id: '665f1c2a3b4d5e6f7a8b9c22',
    name: 'Sunrise Solar Pvt Ltd',
    email: 'hello@sunrisesolar.in',
    phone: '9820012345',
    status: 'active',
    limits: { maxConcurrentLogins: 2, maxBranches: 3, maxClients: 100, maxDesigns: 200 },
    subscription: { periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z', status: 'active', billingCycle: 'monthly', cancelAtPeriodEnd: false },
    features: { pdfBranding: true, excelImport: true },
    theme: { primary: '#1d4ed8', accent: '#f59e0b' },
    logo: '/uploads/logo-sunrise.png',
    hasBranches: true,
  },
};

const deviceLimitExample = {
  error: 'Another device is already signed in. Sign out there first, then try again.',
  code: 'DEVICE_LIMIT',
  details: {
    max: 1,
    active: 1,
    sessions: [{
      sessionId: 'a1b2c3d4e5f67890',
      userName: 'Anita Sharma',
      userEmail: 'branch.pune@sunrisesolar.in',
      role: 'branch',
      device: 'Windows PC',
      lastActiveAt: '2026-11-23T07:00:00.000Z',
    }],
  },
};

const publicCompany = {
  type: 'object',
  description: 'Contact and branding a prospect may see. No id, bank account, or tax id.',
  properties: {
    name: { type: 'string', example: 'Sunrise Solar — Pune HQ' },
    logo: { type: 'string', description: 'Public `/uploads/...` path, or empty. Load it with GET `/uploads/{name}` and no signature.' },
    phone: { type: 'string', example: '9820012345' },
    alternatePhone: { type: 'string' },
    email: { type: 'string', example: 'hello@sunrisesolar.in' },
    address: { type: 'string' },
    website: { type: 'string' },
    tagline: { type: 'string' },
    theme: theme,
    currency: { type: 'string', example: 'INR' },
    taxLabel: { type: 'string', example: 'GST' },
    taxRate: { type: 'number', example: 18 },
  },
};

const publicSummary = {
  type: 'object',
  properties: {
    address: { type: 'string', example: 'Karve Road, Kothrud, Pune, Maharashtra 411038' },
    kwp: { type: 'number', example: 5.18, description: 'System size in kWp.' },
    panels: { type: 'number', example: 9, description: 'Panel count.' },
    annualKwh: { type: 'number', example: 7700 },
  },
};

const designStatus = { type: 'string', enum: ['draft', 'proposed', 'reproposed', 'negotiation', 'won', 'lost'] };

const proposalBody = {
  type: 'object',
  properties: {
    name: { type: 'string', example: 'Joshi residence – 5 kW rooftop' },
    type: { type: 'string', enum: ['3d', 'quick'], description: '`quick` is a product list with no 3D scene.' },
    status: designStatus,
    createdAt: { type: 'string', format: 'date-time' },
    validUntil: { type: 'string', format: 'date-time', nullable: true, description: 'Last moment the price holds. Null when the proposal has no validity date.' },
    expired: { type: 'boolean', description: 'True when `validUntil` is in the past.' },
    summary: publicSummary,
    pricing: {
      nullable: true,
      type: 'object',
      description: 'Price breakdown stored on the proposal, or null. This route reads `total` (number). Any other keys are whatever the designer saved (lines, tax). Do not assume a fixed line schema.',
      properties: { total: { type: 'number', example: 268000 } },
    },
    total: { type: 'number', description: '`pricing.total` when that value is present, otherwise `summary.cost`, rounded to 2 decimals.', example: 268000 },
    subsidy: {
      nullable: true,
      description: 'Null when the proposal has no subsidy enabled.',
      type: 'object',
      properties: {
        enabled: { type: 'boolean', enum: [true] },
        central: { type: 'number', example: 78000, description: 'Central subsidy amount in the company currency.' },
        state: { type: 'number', example: 0 },
      },
    },
    hasDesign: { type: 'boolean', description: 'True when `type` is not `quick` and the stored scene has at least one section. Call the design route only when this is true.' },
  },
};

const designDataSchema = {
  type: 'object',
  description: 'Designer state stored on the proposal. The public API itself reads `sections` (non-empty array means a 3D scene) and `origin.lat` / `origin.lng` (the map is allowed only within about 0.02 degrees, roughly 2 km). Other keys are whatever the designer saved. Seeded scenes use `place`, `origin`, `sections`, and `objects`.',
  properties: {
    origin: {
      type: 'object',
      properties: {
        lat: { type: 'number', example: 18.50746 },
        lng: { type: 'number', example: 73.80764 },
      },
    },
    sections: {
      type: 'array',
      description: 'Roof sections. Each item is the object the designer saved.',
      items: { type: 'object' },
    },
  },
};

const panelSchema = {
  type: 'object',
  description: 'A panel the 3D view can place. `price` is always 0 on this public route.',
  properties: {
    id: { type: 'string', example: '665f1c2a3b4d5e6f7a8b9c51' },
    brand: { type: 'string', example: 'Waaree' },
    model: { type: 'string', example: '540' },
    watts: { type: 'number', example: 540 },
    length: { type: 'number', description: 'Metres.', example: 2.278 },
    width: { type: 'number', description: 'Metres.', example: 1.134 },
    warrantyMonths: { type: 'number', example: 144 },
    hsnCode: { type: 'string', example: '85414300' },
    gstPercent: { type: 'number', example: 18, description: 'Omitted only when the product has no GST percent stored.' },
    attributes: { type: 'object', additionalProperties: true, description: 'Datasheet values keyed by the category attribute key.' },
    price: { type: 'number', example: 0, description: 'Always 0 here. The real price is not shown on a share link.' },
    manufactureYear: { type: 'integer', nullable: true, example: 2025 },
    warrantyYears: { type: 'integer', description: '`warrantyMonths` divided by 12, rounded down.', example: 12 },
    categoryName: { type: 'string', example: 'Solar panels' },
    parentId: { type: 'string', description: 'Parent category id, or empty.', example: '665f1c2a3b4d5e6f7a8b9c61' },
    parentName: { type: 'string' },
    parentOrder: { type: 'integer', description: '1-based order. 0 when the category has no parent.' },
  },
};

const pillarSchema = {
  type: 'object',
  description: 'A pole. `pricePerFt` is always 0 on this public route.',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', example: 'Hot-dip galvanised pole' },
    shape: { type: 'string', enum: ['l-shape', 'cylindrical', 'square'], description: 'Absent when the product has no shape.' },
    pricePerFt: { type: 'number', example: 0 },
    hsnCode: { type: 'string' },
    gstPercent: { type: 'number' },
    categoryName: { type: 'string' },
    parentId: { type: 'string' },
    parentName: { type: 'string' },
    parentOrder: { type: 'integer' },
  },
};

const freeCompany = {
  type: 'object',
  required: ['name', 'contactName', 'phone'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 160, description: 'Required. At least 2 characters after trim. Error: "Enter your company name".', example: 'Patil Solar' },
    contactName: { type: 'string', minLength: 2, maxLength: 120, description: 'Required. At least 2 characters. Error: "Enter your name".', example: 'Rahul Patil' },
    phone: { type: 'string', maxLength: 20, description: 'Required. After trim, at least 7 digits (other characters are ignored for the count, and the text is stored as typed, not rewritten to 10 digits). Error: "Enter your mobile number".', example: '9876543210' },
    email: { type: 'string', maxLength: 160, description: 'Optional. Trimmed and lowercased. Not format-checked. Empty is allowed.', example: 'rahul@patilsolar.in' },
    address: { type: 'string', maxLength: 400 },
    taxId: { type: 'string', maxLength: 30 },
    website: { type: 'string', maxLength: 160 },
  },
};

const freeClient = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 160, description: 'Required. Error: "Enter your client’s name".', example: 'Meera Joshi' },
    phone: { type: 'string', maxLength: 20, description: 'Optional. Stored as typed, up to 20 characters.' },
    email: { type: 'string', maxLength: 160, description: 'Optional. Trimmed and lowercased.' },
    address: { type: 'string', maxLength: 400 },
  },
};

const freeSystem = {
  type: 'object',
  required: ['kw'],
  properties: {
    title: { type: 'string', maxLength: 160, example: '5 kW rooftop' },
    type: { type: 'string', maxLength: 40, description: 'Free text, for example On-grid. Not an enum.', example: 'On-grid' },
    kw: { type: 'number', minimum: 0, maximum: 1000000, description: 'Required and must be greater than 0 (0 is rejected). A blank or non-numeric value is read as 0 and rejected with "Enter the size of the system in kW".', example: 5 },
    panelCount: { type: 'integer', description: 'Rounded. Blank becomes 0. Max 10000000.', example: 9 },
    panelBrand: { type: 'string', maxLength: 120, example: 'Waaree' },
    panelWatts: { type: 'number', maximum: 2000, example: 540 },
    inverter: { type: 'string', maxLength: 160, example: 'Growatt 5 kW' },
    structure: { type: 'string', maxLength: 160, example: 'GI elevated' },
    warranty: { type: 'string', maxLength: 200 },
    annualKwh: { type: 'number', maximum: 10000000000, example: 7500 },
    tariff: { type: 'number', maximum: 1000000, description: 'Electricity rate. Blank becomes 0.', example: 8 },
  },
};

const freeItem = {
  type: 'object',
  required: ['name', 'rate'],
  properties: {
    kind: { type: 'string', enum: ['product', 'service'], description: 'Anything other than `service` is stored as `product`. A service is stored with quantity 1, empty unit, and empty description.', example: 'product' },
    name: { type: 'string', maxLength: 160, description: 'Rows with an empty name are dropped. If none remain: "Add at least one product or service with its quantity and rate".', example: 'Solar panel 540 W' },
    description: { type: 'string', maxLength: 400, description: 'Ignored for a service (stored as empty).' },
    qty: { type: 'number', minimum: 0, maximum: 1000000000, description: 'Required for a product and must be greater than 0 (0 is rejected). Error: "Enter the quantity of <name>". A service is forced to 1.', example: 9 },
    unit: { type: 'string', maxLength: 20, example: 'Nos' },
    rate: { type: 'number', description: 'Price per unit. Blank becomes 0. No separate "rate required" error.', example: 14500 },
    taxPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Used only when pricing.taxType is None (or omitted). Blank becomes 0.', example: 5 },
  },
};

const freePricing = {
  type: 'object',
  properties: {
    currency: { type: 'string', description: 'Three uppercase letters, otherwise stored as INR.', example: 'INR' },
    discount: { type: 'number', description: 'Amount, or a percent when `discountIsPercent` is true (then capped at 100 for the calculation). Blank becomes 0.', example: 5000 },
    discountIsPercent: { type: 'boolean', description: 'Omitted is false.', example: false },
    discountRemark: { type: 'string', maxLength: 200 },
    taxType: { type: 'string', enum: ['None', 'GST', 'VAT', 'Sales tax', 'Service tax', 'SST', 'HST', 'Other'], description: 'Any other text, including a blank, is stored as None. `none` in any letter case also means no global tax.', example: 'GST' },
    taxPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Ignored and stored as 0 when taxType is None.', example: 13.8 },
    subsidy: { type: 'number', description: 'Subtracted from the total, but never more than the total. Blank becomes 0.', example: 78000 },
  },
};

const freeTerms = {
  type: 'object',
  properties: {
    validUntil: { type: 'string', description: 'Kept only when it is exactly `YYYY-MM-DD`. Anything else is stored as an empty string.', example: '2026-12-31' },
    payment: { type: 'string', description: 'Rich text (HTML from the editor) or plain text (each non-empty line becomes a numbered list). Empty is allowed. Too long: "The payment terms are too long". Limit is 30000 characters of HTML or 6000 characters of visible text.' },
    conditions: { type: 'string', description: 'Same rich-text rules. Too long: "The terms & conditions are too long".' },
    notes: { type: 'string', description: 'Same rich-text rules. Too long: "The notes are too long".' },
  },
};

const freeDesign = {
  type: 'object',
  properties: {
    cover: { type: 'string', enum: ['magazine', 'photo', 'panel', 'minimal'], description: 'Anything else is stored as magazine.', example: 'magazine' },
    primary: { type: 'string', description: '`#` plus 6 hex digits. Anything else is stored as #1D4ED8.', example: '#1D4ED8' },
    accent: { type: 'string', description: '`#` plus 6 hex digits. Anything else is stored as #F5B82E.', example: '#F5B82E' },
  },
};

const freeRequest = {
  type: 'object',
  required: ['company', 'client', 'system', 'items'],
  description: 'There is no zod schema on this route. Unknown keys are ignored. Strings are trimmed and clipped. Numbers that are blank or not finite become 0. Omit an optional key to store the empty default.',
  properties: {
    company: freeCompany,
    client: freeClient,
    system: freeSystem,
    items: { type: 'array', maxItems: 80, minItems: 1, items: freeItem, description: 'At most 80 rows are read. Rows without a name are dropped.' },
    pricing: freePricing,
    terms: freeTerms,
    design: freeDesign,
    logo: { type: 'string', description: 'Optional data URL: `data:image/png;base64,...`, or jpeg, or webp. At most 400000 characters and only base64 characters after the comma. Anything else is stored as an empty string (the save still succeeds).' },
    device: {
      type: 'object',
      description: 'Optional. What the browser reports. The server also stores the User-Agent header (browser, OS, and mobile/tablet/desktop) itself; you do not send those.',
      properties: {
        screen: { type: 'string', maxLength: 20, description: 'For example 1440x900.', example: '1440x900' },
        language: { type: 'string', maxLength: 20, example: 'en-IN' },
        platform: { type: 'string', maxLength: 60, example: 'Win32' },
        timezone: { type: 'string', maxLength: 60, description: 'IANA name from the clock, for example Asia/Kolkata. Stored on the lead, not returned to the visitor.', example: 'Asia/Kolkata' },
      },
    },
    position: {
      type: 'object',
      description: 'Optional. Send only after the visitor agrees to share location. Both lat and lng must be finite and in range or the position is discarded. Not returned to the visitor.',
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90, example: 18.52 },
        lng: { type: 'number', minimum: -180, maximum: 180, example: 73.85 },
        accuracy: { type: 'number', description: 'Metres. Stored as accuracyM only when lat and lng are both kept. Absolute value above 10000000 is dropped.', example: 40 },
      },
    },
  },
};

const freeUpdateRequest = {
  allOf: [freeRequest],
  description: 'Same body as create. Send the full proposal again; this is not a partial update. Omit `downloaded` to leave the download count unchanged.',
  properties: {
    downloaded: { type: 'boolean', description: 'When true, the stored download count increases by 1. The count is not in the response. Any other truthy value also increments it.' },
  },
};

const freeTotals = {
  type: 'object',
  description: 'Computed by the server. Each line is quantity times rate. Discount comes off the subtotal. Tax is the global percent of the taxable amount when taxType is set and is not None; otherwise each line\'s own tax percent. Subsidy is capped at the total. All values are rounded to 2 decimals.',
  properties: {
    subtotal: { type: 'number', example: 180000 },
    discountAmount: { type: 'number', example: 5000 },
    taxable: { type: 'number', example: 175000 },
    tax: { type: 'number', example: 24150 },
    total: { type: 'number', example: 199150 },
    subsidy: { type: 'number', example: 78000 },
    net: { type: 'number', description: 'total minus subsidy.', example: 121150 },
  },
};

const freeView = {
  type: 'object',
  description: 'What the visitor may see. Device, location, IP, referrer, status, admin notes, and the download count are not included.',
  required: ['refNo', 'token', 'data', 'logo', 'totals', 'createdAt', 'updatedAt'],
  properties: {
    refNo: { type: 'string', description: 'Printed on the PDF. Shape FP-YYMMDD- plus 4 hex characters.', example: 'FP-261123-9F2C' },
    token: { type: 'string', description: 'Secret for the visitor link. 24 url-safe characters. Put it in `/api/public/free-proposals/{token}`.' },
    data: {
      type: 'object',
      properties: {
        company: freeCompany,
        client: freeClient,
        system: freeSystem,
        items: { type: 'array', items: freeItem },
        pricing: freePricing,
        terms: {
          type: 'object',
          properties: {
            validUntil: { type: 'string', example: '2026-12-31' },
            payment: { type: 'string', description: 'Sanitised HTML, or empty.' },
            conditions: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        design: freeDesign,
      },
    },
    logo: { type: 'string', description: 'The data URL that was accepted, or empty.' },
    totals: freeTotals,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const freeExample = {
  refNo: 'FP-261123-9F2C',
  token: 'a1b2c3d4e5f6g7h8i9j0k1l2',
  logo: '',
  totals: { subtotal: 180000, discountAmount: 5000, taxable: 175000, tax: 24150, total: 199150, subsidy: 78000, net: 121150 },
  createdAt: '2026-11-23T08:00:00.000Z',
  updatedAt: '2026-11-23T08:00:00.000Z',
  data: {
    company: { name: 'Patil Solar', contactName: 'Rahul Patil', phone: '9876543210', email: 'rahul@patilsolar.in', address: 'Pune', taxId: '', website: '' },
    client: { name: 'Meera Joshi', phone: '9123456780', email: '', address: 'Kothrud, Pune' },
    system: { title: '5 kW rooftop', type: 'On-grid', kw: 5, panelCount: 9, panelBrand: 'Waaree', panelWatts: 540, inverter: 'Growatt 5 kW', structure: 'GI elevated', warranty: '25 years panels', annualKwh: 7500, tariff: 8 },
    items: [{ kind: 'product', name: 'Solar panel 540 W', description: '', qty: 9, unit: 'Nos', rate: 14500, taxPercent: 0 }],
    pricing: { currency: 'INR', discount: 5000, discountIsPercent: false, discountRemark: '', taxType: 'GST', taxPercent: 13.8, subsidy: 78000 },
    terms: { validUntil: '2026-12-31', payment: '', conditions: '', notes: '' },
    design: { cover: 'magazine', primary: '#1D4ED8', accent: '#F5B82E' },
  },
};

const contactResponse = {
  type: 'object',
  description: 'The saved lead, including the IP and browser the server saw. `status` starts as new. `adminNotes` starts empty.',
  properties: {
    id: oid,
    name: { type: 'string', example: 'Rahul Patil' },
    email: { type: 'string', example: 'rahul@patilsolar.in' },
    phone: { type: 'string', example: '9876543210', description: 'Stored as typed, clipped to 20 characters. Not rewritten to a 10-digit Indian mobile.' },
    company: { type: 'string', example: 'Patil Solar' },
    message: { type: 'string' },
    status: { type: 'string', enum: ['new', 'contacted', 'closed'], example: 'new' },
    adminNotes: { type: 'string', example: '' },
    ip: { type: 'string' },
    userAgent: { type: 'string' },
    referrer: { type: 'string', description: 'The Referer header, clipped to 300 characters.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const notificationSchema = {
  type: 'object',
  description: 'One inbox row for the signed-in user. `id` replaces `_id`.',
  properties: {
    id: oid,
    user: { description: 'Recipient user id.', allOf: [oid] },
    company: { description: 'Branch id the event belonged to, or null.', nullable: true, allOf: [oid] },
    type: {
      type: 'string',
      description: 'Event name. Known values written by the app: step_status_changed, step_assigned, ticket_update, client_ticket_update, proposal_client_response, proposal_ready_for_review, amc_requested, amc_assigned, amc_upcoming, referral_added, referral_converted, referral_lost.',
      example: 'step_status_changed',
    },
    title: { type: 'string', example: 'Installation Step Updated' },
    body: { type: 'string', example: 'Structure installation has been marked as Done (Joshi residence).' },
    path: { type: 'string', description: 'Frontend path to open. Examples: `/dashboard/installations/<projectId>`, `/agent/projects/<projectId>`, `/dashboard/support/<ticketId>`, `/agent/client-support/<ticketId>`, `/portal/support/<ticketId>`, `/portal/<designId>`, `/dashboard/amc`, `/agent/amc?scope=all`, `/portal/maintenance`, `/dashboard/leads/manual`, `/agent/leads/manual`, `/portal/refer`.', example: '/dashboard/installations/665f1c2a3b4d5e6f7a8b9c71' },
    data: {
      type: 'object',
      additionalProperties: true,
      description: 'Small payload for the screen. By type: step_status_changed `{ event, installationId, installationStepId, status, previousStatus }` with status one of pending, in_progress, done; step_assigned `{ event, installationId, installationStepId }`; ticket_update and client_ticket_update `{ event, ticketId }`; proposal_client_response `{ event, designId, decision }` with decision accepted, rejected, or changes_requested; proposal_ready_for_review `{ event, designId }`; amc_requested `{ event }`; amc_assigned `{ event }` and, for the staff row, `installationId`; amc_upcoming `{ event, installationId }` on the company row; referral_added, referral_converted, referral_lost `{ event, leadId }`.',
    },
    eventKey: { type: 'string', description: 'Dedupes a retried event for this user.' },
    readAt: { type: 'string', format: 'date-time', nullable: true, description: 'Null while unread.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const binary = { schema: { type: 'string', format: 'binary' } };

const tokenParam = {
  name: 'token',
  in: 'path',
  required: true,
  description: 'Share token from the proposal link or QR code. 16 to 64 characters: letters, digits, underscore, hyphen.',
  schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,64}$', example: 'k3mN9pQ2rS7tU4vW8xY1zA6bC0dE' },
};

const freeTokenParam = {
  name: 'token',
  in: 'path',
  required: true,
  description: 'Token returned when the free proposal was created. 10 to 40 characters: letters, digits, underscore, hyphen. A real token is 24 characters.',
  schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{10,40}$', example: 'a1b2c3d4e5f6g7h8i9j0k1l2' },
};

const docTokenParam = {
  name: 'token',
  in: 'path',
  required: true,
  description: 'Token from `GET /api/files/share-link`. 8 to 32 characters: letters, digits, underscore, hyphen. A real token is 12 characters. Valid for 7 days from the last time the share link was asked for.',
  schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,32}$', example: 'xY7kL2pQ9mNa' },
};

export default {
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'authLogin',
      summary: 'Sign in with email and password and receive a bearer token.',
      description: `Anyone, no token. The email is trimmed and lowercased. The password is only checked for being present (1 to 200 characters); the letter-and-number rule applies when a password is set, not here.

On success the server records the sign-in time, opens a device session, and returns \`token\` plus the same session object as \`GET /api/auth/me\` with \`impersonated: false\`. Save \`token\` and send it as \`Authorization: Bearer <token>\`.

\`company\` is null and \`organization\` is null for a super admin. An agent receives the short company object. A client receives the portal company object. A branch owner and a company admin receive the full company object (masters and \`billing\`). A company admin is placed in their last active branch, or the oldest active branch if that one is suspended. A company admin cannot sign in when the organization was set up without branches (401, same message as a wrong password).

\`replaceSessions\` is not in the zod schema (the schema is loose, so it is kept). The controller treats any truthy value as true, including the string \`"false"\`. Send JSON \`true\` or \`false\`. When true, a branch owner is signed out of every other owner device of that branch, and a company admin is signed out of their own other devices, and this sign-in proceeds. It does nothing for an agent, a client, or a super admin. When false or omitted, a second device is refused (see 403).

Per IP: 60 requests per 15 minutes, plus the API-wide limit. Separately, 8 wrong passwords for the same IP and email inside 15 minutes return 429 without \`code\`: "Too many attempts. Try again in a few minutes." A successful sign-in clears that counter.

Zod messages (400, \`code\` \`VALIDATION\`, \`details.fields\`): "Email is required"; "Enter a valid email address (like name@company.com)"; "Too long (up to 200 characters)"; "Password is required"; "Password is too long". The service also has "Email and password are required" if both are blank after trim.

Other errors: 401 "Incorrect email or password". 403 "This account has been deactivated. Contact your company." (inactive agent or client). 403 "This company account is suspended. Contact the platform administrator." ${API_LIMIT}`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', maxLength: 200, description: 'Required. Trimmed and stored comparison is lowercase. Must look like name@company.com (no consecutive dots).', example: 'branch.pune@sunrisesolar.in' },
                password: { type: 'string', minLength: 1, maxLength: 200, description: 'Required. Any characters. The 8-character letter-and-number rule is not applied at sign-in.', example: 'Sunrise1' },
                replaceSessions: { type: 'boolean', description: 'Optional. Omit or false to refuse a second device. True signs the other counted devices out and continues. See the description for which roles it affects.', example: false },
              },
            },
            example: { email: 'branch.pune@sunrisesolar.in', password: 'Sunrise1', replaceSessions: false },
          },
        },
      },
      responses: {
        200: json('Session. Cache is not set specially. Replace any previous token.', loginResponse, loginExample),
        400: ValidationError,
        401: json('Wrong email or password, no active branch, or a company-admin account on an organization without branches. The message is always the same.', err, { error: 'Incorrect email or password' }),
        403: json('Deactivated account, suspended company, or the device limit. When `code` is `DEVICE_LIMIT`, show the other devices from `details.sessions` and offer to sign in with `replaceSessions: true`. `details.max` is 1. `details.active` is how many devices are already in. Each session has `sessionId`, `userName`, `userEmail`, `role`, `device`, `lastActiveAt`.', {
          allOf: [err],
          properties: {
            code: { type: 'string', example: 'DEVICE_LIMIT' },
            details: {
              type: 'object',
              properties: {
                max: { type: 'integer', example: 1 },
                active: { type: 'integer', example: 1 },
                sessions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string' },
                      userName: { type: 'string' },
                      userEmail: { type: 'string' },
                      role: { type: 'string' },
                      device: { type: 'string', description: 'From the User-Agent: "iPhone or iPad", "Android device", "Mac", "Windows PC", "Linux device", otherwise the first 60 characters of the header, or "Unknown device".' },
                      lastActiveAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        }, deviceLimitExample),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/auth/me': {
    get: {
      tags: ['Auth'],
      operationId: 'authMe',
      summary: 'Return the signed-in user, active branch, and organization.',
      description: `Any signed-in role, including super admin, company admin, branch owner, agent, and client. No body. Nothing is written.

The JSON is the session: \`user\`, \`company\`, \`organization\`, \`impersonated\`. Shapes depend on \`user.role\` (see the schema). Use this on load to restore the screen without calling login again.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      responses: {
        200: json('Current session.', sessionWithFlag, { ...loginExample, impersonated: false }),
        401: Unauthorized,
        403: Forbidden,
        429: RateLimited,
        500: ServerError,
      },
    },
    put: {
      tags: ['Auth'],
      operationId: 'authUpdateMe',
      summary: 'Change the signed-in user\'s display name.',
      description: `Any signed-in user. The only field read is \`name\`. Omit \`name\` to leave it unchanged. Send a string (max 120 characters after trim) to replace it. An empty string or null clears it (null is treated as empty). Extra keys are ignored.

The name is saved, then the response is the same session object as \`GET /api/auth/me\` (including \`impersonated\`). The token does not change.

Zod messages: "Enter text"; "Too long (up to 120 characters)".

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Partial. Omit `name` to leave it unchanged.',
              properties: {
                name: { type: 'string', maxLength: 120, description: 'Optional. Any characters, including digits and symbols. Empty clears the name.', example: 'Anita Sharma' },
              },
            },
            example: { name: 'Anita Sharma' },
          },
        },
      },
      responses: {
        200: json('Updated session, same shape as GET /api/auth/me.', sessionWithFlag),
        400: ValidationError,
        401: Unauthorized,
        403: Forbidden,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/auth/password': {
    post: {
      tags: ['Auth'],
      operationId: 'authChangePassword',
      summary: 'Change the signed-in user\'s password and receive a new token.',
      description: `Any signed-in user except while a platform admin is impersonating them. That case is 403 "Not available while signed in as a company. Reset it from the admin console." and the password is not changed.

\`current\` is the existing password (1 to 200 characters, any content). \`next\` is the new one: 8 to 200 characters, at least one letter and one number. Zod messages: "Password is required"; "Password is too long"; "Enter a password"; "Password must be at least 8 characters"; "Password needs at least one letter and one number".

Wrong current password: 400 "Current password is incorrect" (no \`code\`).

On success every session for this user is revoked, a new session is opened, and the response is \`{ ok: true, token }\`. Replace the stored token. Older tokens then fail with "Your password was changed. Sign in again."

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['current', 'next'],
              properties: {
                current: { type: 'string', minLength: 1, maxLength: 200, description: 'Password they have now.', example: 'Sunrise1' },
                next: { type: 'string', minLength: 8, maxLength: 200, description: 'New password. At least one letter and one number.', example: 'Sunrise2' },
              },
            },
            example: { current: 'Sunrise1', next: 'Sunrise2' },
          },
        },
      },
      responses: {
        200: json('Password saved. Use the new token.', {
          type: 'object',
          required: ['ok', 'token'],
          properties: {
            ok: { type: 'boolean', enum: [true] },
            token: { type: 'string', description: 'JWT for the new session. The branch id in it is the user\'s current branch, when they have one.' },
          },
        }, { ok: true, token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjVmMWMyYTNiNGQ1ZTZmN2E4YjljMGQifQ.signature' }),
        400: ValidationError,
        401: Unauthorized,
        403: json('Impersonation cannot change the password. Other 403s are the usual suspended-company cases.', err, { error: 'Not available while signed in as a company. Reset it from the admin console.' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      operationId: 'authLogout',
      summary: 'Sign out this device and revoke its session.',
      description: `Any signed-in user. No body. The current device session is deleted. The response is \`{ ok: true }\`. Drop the token. Later calls with it return 401 "This device was signed out. Sign in again, or free a slot by signing out on another device." Other devices are left signed in.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      responses: {
        200: json('This device is signed out.', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } }, { ok: true }),
        401: Unauthorized,
        403: Forbidden,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/auth/branch': {
    post: {
      tags: ['Auth'],
      operationId: 'authSwitchBranch',
      summary: 'Switch the company admin to another active branch.',
      description: `Only \`role: company\` (the organization admin). A branch owner, agent, client, or super admin receives 403 "You do not have access to this area".

Body is \`{ branchId }\`. There is no zod schema. \`branchId\` must be a 24-hex id of an **active** branch in this user's organization. A missing, malformed, suspended, or foreign id is 404 "Branch not found".

On success the user's active branch is saved, this session is pointed at that branch, and a new token is returned. Replace the stored token. \`company\` in the body is the owner view of the new branch. \`organization\` is included. \`impersonated\` is not in this response.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['branchId'],
              properties: {
                branchId: { allOf: [oid], description: 'Active branch in the same organization.' },
              },
            },
            example: { branchId: '665f1c2a3b4d5e6f7a8b9c11' },
          },
        },
      },
      responses: {
        200: json('New token and the session for that branch. No `impersonated` field.', branchResponse),
        401: Unauthorized,
        403: Forbidden,
        404: json('No active branch with that id in this organization. A bad id uses the same message.', err, { error: 'Branch not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/proposals/{token}': {
    get: {
      tags: ['Public'],
      operationId: 'publicProposal',
      summary: 'Read a shared proposal from its link or QR code.',
      description: `No token. Anyone who has the share token. Read-only. The response header \`Cache-Control\` is \`no-store\`.

The token is 16 to 64 characters (letters, digits, underscore, hyphen). A bad token, an unknown token, or a proposal whose branch is missing or suspended is 404 "Proposal not found". The client's phone, email, address, payments, and notes are never returned. The client name is.

\`proposal.total\` is the grand total. \`proposal.hasDesign\` tells you whether to call the design route. \`proposal.pricing\` is the stored breakdown or null; the field this screen needs from it is \`total\`.

${PUBLIC_LIMIT}`,
      security: [],
      parameters: [tokenParam],
      responses: {
        200: json('Proposal page payload.', {
          type: 'object',
          properties: {
            company: publicCompany,
            client: { type: 'object', properties: { name: { type: 'string', example: 'Meera Joshi' } } },
            proposal: proposalBody,
          },
        }, {
          company: { name: 'Sunrise Solar — Pune HQ', logo: '/uploads/logo-sunrise.png', phone: '9820012345', alternatePhone: '', email: 'hello@sunrisesolar.in', address: '214 Business Park, Baner Road, Pune', website: 'www.sunrisesolar.in', tagline: 'Clean energy for a brighter tomorrow', theme: { primary: '#1d4ed8', accent: '#f59e0b' }, currency: 'INR', taxLabel: 'GST', taxRate: 18 },
          client: { name: 'Meera Joshi' },
          proposal: { name: 'Joshi residence – 5 kW rooftop', type: '3d', status: 'proposed', createdAt: '2026-11-01T06:00:00.000Z', validUntil: '2026-12-15T00:00:00.000Z', expired: false, summary: { address: 'Karve Road, Kothrud, Pune', kwp: 5.18, panels: 9, annualKwh: 7700 }, pricing: { total: 268000 }, total: 268000, subsidy: { enabled: true, central: 78000, state: 0 }, hasDesign: true },
        }),
        404: json('Unknown token, or the branch is not active.', err, { error: 'Proposal not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/proposals/{token}/design': {
    get: {
      tags: ['Public'],
      operationId: 'publicProposalDesign',
      summary: 'Return the 3D scene for a shared proposal.',
      description: `No token. Same share token as the proposal page. Header \`Cache-Control: no-store\`.

404 "Proposal not found" for a bad or unknown token or an inactive branch. 400 "This proposal has no 3D design" when \`type\` is \`quick\` or the scene has no sections. Call this only when the proposal payload says \`hasDesign: true\`.

\`id\` is the literal string \`"public"\`, not a database id. \`data\` is the designer state. Use \`data.origin\` with \`GET /api/public/staticmap\`.

${PUBLIC_LIMIT}`,
      security: [],
      parameters: [tokenParam],
      responses: {
        200: json('Scene for the public 3D viewer.', {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ['public'] },
            name: { type: 'string' },
            status: designStatus,
            data: designDataSchema,
            summary: publicSummary,
            client: { type: 'object', properties: { name: { type: 'string' } } },
            company: publicCompany,
          },
        }),
        400: json('The proposal has no 3D scene.', err, { error: 'This proposal has no 3D design' }),
        404: json('Unknown token or inactive branch.', err, { error: 'Proposal not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/proposals/{token}/catalog': {
    get: {
      tags: ['Public'],
      operationId: 'publicProposalCatalog',
      summary: 'Return panel and pole geometry for a shared 3D proposal, with prices removed.',
      description: `No token. Same share token. Header \`Cache-Control: no-store\`.

404 "Proposal not found" when the token is bad, unknown, or the branch is inactive.

Prices are stripped: every panel \`price\` is 0, every pillar \`pricePerFt\` is 0, and \`otherCostPerKw\` is 0. \`packages\` and \`materialCategories\` are always empty arrays on this route (the public viewer does not receive the rest of the catalog). Panels are only products of type panels that have watts, length, and width. Pillars are products of type poles.

${PUBLIC_LIMIT}`,
      security: [],
      parameters: [tokenParam],
      responses: {
        200: json('Geometry catalog. Prices are zero.', {
          type: 'object',
          properties: {
            currency: { type: 'string', example: 'INR' },
            tariff: { type: 'number', example: 8 },
            otherCostPerKw: { type: 'number', example: 0, description: 'Always 0.' },
            panels: { type: 'array', items: panelSchema },
            pillars: { type: 'array', items: pillarSchema },
            packages: { type: 'array', maxItems: 0, items: { type: 'object' }, description: 'Always empty.' },
            materialCategories: { type: 'array', maxItems: 0, items: { type: 'object' }, description: 'Always empty.' },
          },
        }),
        404: json('Unknown token or inactive branch.', err, { error: 'Proposal not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/documents/{token}': {
    get: {
      tags: ['Public'],
      operationId: 'publicDocument',
      summary: 'Download a billing PDF from a short share link.',
      description: `No bearer token. The token comes from \`GET /api/files/share-link\` and is meant for WhatsApp or SMS. It is not a proposal share token.

A token that is not 8 to 32 url-safe characters, or that is unknown or expired, is 404 JSON \`{ "error": "Document not found" }\`. A token that is valid but whose file is gone is 404 with an **empty** body.

Success streams the file. PDF is \`Content-Type: application/pdf\`. Anything else is \`application/octet-stream\`. \`Content-Disposition\` is \`inline\`. \`Cache-Control\` is \`private, max-age=300\`. \`ETag\` and \`Last-Modified\` are set when the store has them. Send \`If-None-Match\` with the previous ETag to get 304 and an empty body. Range requests are not supported on this route (the whole file is sent).

${PUBLIC_LIMIT}`,
      security: [],
      parameters: [
        docTokenParam,
        { name: 'If-None-Match', in: 'header', required: false, description: 'Previous ETag. An exact match returns 304.', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'The file. PDF is shown inline.',
          headers: {
            'Content-Disposition': { schema: { type: 'string' }, description: 'inline; filename="<stored name>"' },
            'Cache-Control': { schema: { type: 'string', example: 'private, max-age=300' } },
            ETag: { schema: { type: 'string' } },
          },
          content: {
            'application/pdf': binary,
            'application/octet-stream': binary,
          },
        },
        304: { description: 'ETag matched. Empty body.' },
        404: json('Bad, unknown, or expired token. A missing file is the same status with an empty body and no JSON.', err, { error: 'Document not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/free-proposals': {
    post: {
      tags: ['Public'],
      operationId: 'publicCreateFreeProposal',
      summary: 'Save a proposal typed on the public proposal maker.',
      description: `No token. The visitor's company, client, system, price lines, and terms are stored as a lead for the platform admin. Nothing is read from a workspace. Status is 200, not 201. Header \`Cache-Control: no-store\`.

The server also stores the caller IP, the User-Agent, and the Referer. Send \`device\` and, if the visitor allowed it, \`position\`. Those are not echoed back.

Validation is in the service, not zod, so 400 is \`{ "error": "<message>" }\` with no \`code\` and no \`details.fields\`. Messages: "Enter your company name"; "Enter your name"; "Enter your mobile number"; "Enter your client’s name"; "Enter the size of the system in kW"; "Add at least one product or service with its quantity and rate"; "Enter the quantity of <item name>"; "The payment terms are too long"; "The terms & conditions are too long"; "The notes are too long".

This route allows 10 creates per IP per hour, then the public 400/10 minutes, then the API-wide limit. A reference-number clash that still fails after retries is 409 "That value is already in use".

${PUBLIC_LIMIT} This route's own limit is 10 requests per IP per hour.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: freeRequest,
            example: freeExample.data,
          },
        },
      },
      responses: {
        200: json('The visitor view, including the new token and reference number.', freeView, freeExample),
        400: json('A required maker field is missing or a rich-text field is too long. No VALIDATION code.', err, { error: 'Enter your company name' }),
        409: Conflict,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/free-proposals/{token}': {
    get: {
      tags: ['Public'],
      operationId: 'publicGetFreeProposal',
      summary: 'Reload a free proposal from the visitor link.',
      description: `No token. Header \`Cache-Control: no-store\`. A token that is not 10 to 40 url-safe characters, or that does not match a saved proposal, is 404 "Proposal not found". The response is the visitor view (no device, location, or admin fields).

${PUBLIC_LIMIT}`,
      security: [],
      parameters: [freeTokenParam],
      responses: {
        200: json('Visitor view.', freeView, freeExample),
        404: json('Unknown or malformed token.', err, { error: 'Proposal not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
    put: {
      tags: ['Public'],
      operationId: 'publicUpdateFreeProposal',
      summary: 'Save the visitor\'s edits to a free proposal they already hold.',
      description: `No token. Same body as create: send the whole proposal again. This is not a field-by-field patch. Header \`Cache-Control: no-store\`.

The same 400 messages as create apply. 404 "Proposal not found" when the token is malformed or unknown. The row keeps its \`refNo\` and \`token\`.

A new \`position\` (both lat and lng valid) replaces the stored location. Editing without a position keeps the previous coordinates and only refreshes IP and timezone. \`device\` is replaced on every save.

Send \`downloaded: true\` when the visitor downloads the PDF so the lead's download count goes up by 1. The count is not in the response.

120 saves per IP per hour, then the public limit, then the API-wide limit.

${PUBLIC_LIMIT} This route's own limit is 120 requests per IP per hour.`,
      security: [],
      parameters: [freeTokenParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: freeUpdateRequest.description,
              properties: { ...freeRequest.properties, downloaded: { type: 'boolean', description: 'True when this save is a PDF download. Omit to leave the count unchanged.', example: false } },
            },
            example: { ...freeExample.data, downloaded: false },
          },
        },
      },
      responses: {
        200: json('Updated visitor view.', freeView, freeExample),
        400: json('Same maker errors as create.', err, { error: 'Enter the size of the system in kW' }),
        404: json('Unknown or malformed token.', err, { error: 'Proposal not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/contact-messages': {
    post: {
      tags: ['Public'],
      operationId: 'publicCreateContactMessage',
      summary: 'Save a Contact Us message from the public landing page.',
      description: `No token. Status 200, not 201. Header \`Cache-Control: no-store\`. The row is a lead for the platform admin. The response includes the stored IP, User-Agent, and Referer; the screen can ignore those.

Zod runs first (400, \`code\` \`VALIDATION\`, \`details.fields\`). Then the service checks lengths again (400, no code).

| Field | Rule | Zod message | Service message |
| --- | --- | --- | --- |
| name | Required, trim, 1 to 120 characters. Service wants at least 2. | "Name is required", "Too long (up to 120 characters)" | "Enter your name" |
| email | Required, trimmed, lowercased, must look like name@company.com. Schema max 200; the service keeps 160 characters, so stay within 160. | "Email is required", "Enter a valid email address (like name@company.com)" | "Enter a valid email address" |
| phone | Required text, max 20 characters. Not rewritten to 10 digits. Service wants at least 7 digits. | "Mobile number is required", "Mobile number can be at most 20 characters" | "Enter your mobile number" |
| company | Optional, max 160. Omit or "" to store empty. | "Company can be at most 160 characters" | |
| message | Required, trim, schema min 1 and max 4000. Service wants at least 5. | "Message is required", "Message can be at most 4000 characters" | "Enter a short message" |

10 messages per IP per hour, then the public limit, then the API-wide limit. The server stores IP, User-Agent, and Referer itself.

${PUBLIC_LIMIT} This route's own limit is 10 requests per IP per hour.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'phone', 'message'],
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 120, example: 'Rahul Patil' },
                email: { type: 'string', format: 'email', maxLength: 160, example: 'rahul@patilsolar.in' },
                phone: { type: 'string', maxLength: 20, description: 'At least 7 digits. Stored as typed.', example: '9876543210' },
                company: { type: 'string', maxLength: 160, description: 'Optional. Omit to leave empty.', example: 'Patil Solar' },
                message: { type: 'string', minLength: 5, maxLength: 4000, example: 'We need a 5 kW system for a bungalow in Kothrud.' },
              },
            },
            example: { name: 'Rahul Patil', email: 'rahul@patilsolar.in', phone: '9876543210', company: 'Patil Solar', message: 'We need a 5 kW system for a bungalow in Kothrud.' },
          },
        },
      },
      responses: {
        200: json('The saved message.', contactResponse, {
          id: '665f1c2a3b4d5e6f7a8b9c0d',
          name: 'Rahul Patil',
          email: 'rahul@patilsolar.in',
          phone: '9876543210',
          company: 'Patil Solar',
          message: 'We need a 5 kW system for a bungalow in Kothrud.',
          status: 'new',
          adminNotes: '',
          ip: '49.36.10.20',
          userAgent: 'Mozilla/5.0',
          referrer: '',
          createdAt: '2026-11-23T08:10:00.000Z',
          updatedAt: '2026-11-23T08:10:00.000Z',
        }),
        400: ValidationError,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/public/staticmap': {
    get: {
      tags: ['Public'],
      operationId: 'publicStaticMap',
      summary: 'Satellite image for a shared proposal\'s 3D ground, authorised by the share token.',
      description: `No bearer token. An \`<img>\` or WebGL texture cannot send headers, so the proposal share token rides in the query as \`st\`. The image is only served when \`lat\` and \`lng\` are within about 0.02 degrees of that proposal's \`data.origin\` (about 2 km).

404 "Proposal not found" for a bad or unknown \`st\`, or an inactive branch. 404 "Location not found" when the point is too far from the site, or when lat/lng are missing or not numbers.

400 "Invalid parameters." when lat, lng, zoom, width, or height is not a finite number, or zoom is outside 1 to 21. Zoom defaults to 20. \`w\` and \`h\` default to 640 and are clamped to 64–640. \`maptype\` must be satellite, hybrid, or roadmap; anything else is satellite.

502 "Could not reach Google Static Maps." or "The satellite image service is not available right now." 429 uses that same satellite message when Google rate-limits (this is not the \`RATE_LIMITED\` envelope). 500 \`{ "error": "The server has no Google API key configured (GOOGLE_MAPS_API_KEY).", "code": "NO_KEY" }\` when the server has no key.

Success is the image bytes. \`Content-Type\` is whatever Google returns and starts with \`image/\` (usually \`image/png\`). \`Cache-Control\` is \`private, max-age=86400\`.

There is no extra limiter on this route beyond the public mount. ${PUBLIC_LIMIT}`,
      security: [],
      parameters: [
        { name: 'st', in: 'query', required: true, description: 'Proposal share token (same value as `/api/public/proposals/{token}`).', schema: { type: 'string', example: 'k3mN9pQ2rS7tU4vW8xY1zA6bC0dE' } },
        { name: 'lat', in: 'query', required: true, description: 'Latitude, -90 to 90, near the proposal site.', schema: { type: 'number', minimum: -90, maximum: 90, example: 18.50746 } },
        { name: 'lng', in: 'query', required: true, description: 'Longitude, -180 to 180, near the proposal site.', schema: { type: 'number', minimum: -180, maximum: 180, example: 73.80764 } },
        { name: 'zoom', in: 'query', required: false, description: 'Map zoom 1 to 21. Default 20.', schema: { type: 'integer', minimum: 1, maximum: 21, default: 20, example: 20 } },
        { name: 'w', in: 'query', required: false, description: 'Width in pixels. Default 640. Clamped to 64–640. Google is asked at scale 2, so the bitmap is twice this.', schema: { type: 'integer', minimum: 64, maximum: 640, default: 640, example: 640 } },
        { name: 'h', in: 'query', required: false, description: 'Height in pixels. Default 640. Clamped to 64–640.', schema: { type: 'integer', minimum: 64, maximum: 640, default: 640, example: 640 } },
        { name: 'maptype', in: 'query', required: false, description: 'Default satellite.', schema: { type: 'string', enum: ['satellite', 'hybrid', 'roadmap'], default: 'satellite' } },
        { name: 'pts', in: 'query', required: false, description: 'Optional roof outline drawn on the image. `lat,lng;lat,lng;...` with at least 3 points and at most 80. Fewer than 3 valid points draws nothing.', schema: { type: 'string', example: '18.50750,73.80760;18.50740,73.80770;18.50740,73.80750' } },
      ],
      responses: {
        200: {
          description: 'Image bytes. Content-Type starts with image/.',
          headers: { 'Cache-Control': { schema: { type: 'string', example: 'private, max-age=86400' } } },
          content: { 'image/png': binary, 'image/jpeg': binary },
        },
        400: json('Zoom or coordinates are not usable.', err, { error: 'Invalid parameters.' }),
        404: json('Bad share token, or the point is not near the proposal site.', err, { error: 'Location not found' }),
        429: json('This API\'s rate limit, or Google throttled the image. The Google case has no RATE_LIMITED code.', err, { error: 'The satellite image service is not available right now.' }),
        500: ServerError,
        502: json('Google Static Maps could not be reached or refused the image.', err, { error: 'Could not reach Google Static Maps.' }),
      },
    },
  },

  '/health': {
    get: {
      tags: ['Public'],
      operationId: 'healthCheck',
      summary: 'Report whether the API process and its database connection are up.',
      description: 'No token. Not under `/api`, so the API rate limit does not apply. No body. `ok` is always true when this handler runs. `db` is true only when the MongoDB connection state is connected (readyState 1). Use it for a load balancer, not for the app UI.',
      security: [],
      responses: {
        200: json('Process is answering.', {
          type: 'object',
          required: ['ok', 'db'],
          properties: {
            ok: { type: 'boolean', enum: [true] },
            db: { type: 'boolean', description: 'True when MongoDB is connected.' },
          },
        }, { ok: true, db: true }),
        500: ServerError,
      },
    },
  },

  '/uploads/{name}': {
    get: {
      tags: ['Files'],
      operationId: 'fileDownload',
      summary: 'Stream a stored file by its random name.',
      description: `No bearer token. Mounted at \`/uploads\`, not under \`/api\`, so the API rate limit does not apply. The bucket stays private; this route is the only read path.

\`name\` must match \`^[\\\\w][\\\\w.-]{0,200}$\` (a letter, digit, or underscore, then up to 200 of those plus \`.\` and \`-\`). A name that fails that test, or a name that is not in storage, is **404 with an empty body** (no JSON).

Public files (logos, signatures, QR images, avatars: anything whose name does not use a protected prefix below) need no query. Protected files need \`exp\` and \`sig\` from \`GET /api/files/link\` (10 minutes) or they are 403 JSON \`{ "error": "This link has expired or is not valid" }\`. \`exp\` is a unix time in **milliseconds**. \`sig\` is a hex HMAC.

Protected prefixes: \`<24 hex>-doc-\` (client documents), \`<24 hex>-step-\` (installation photos), \`ticket-\` (platform support), \`cticket-\` (client support), \`<24 hex>-design-\` (quotation PDFs), \`<24 hex>-invoice-\`, \`<24 hex>-receipt-\`, \`<24 hex>-ewaybill-\`, \`<24 hex>-salebill-\`, \`<24 hex>-creditnote-\`, \`<24 hex>-proddoc-\` (product PDFs), \`<24 hex>-bill-\` (supplier bills), \`<24 hex>-loandoc-\`, \`<24 hex>-subsidydoc-\`, \`<24 hex>-expbill-\`.

Content-Type by extension: \`.png\` image/png, \`.jpg\` and \`.jpeg\` image/jpeg, \`.webp\` image/webp, \`.gif\` image/gif, \`.pdf\` application/pdf. Anything else is \`application/octet-stream\` and is forced to download (\`Content-Disposition: attachment; filename="<name>"\`). Pass \`download\` (a non-empty string) to force a download under that name instead (control characters, quotes, and slashes are stripped; max 200 characters).

\`Cache-Control\` is \`private, max-age=300\` for a protected file and \`public, max-age=604800\` for a public file. \`Accept-Ranges: bytes\`. Send \`Range: bytes=start-end\` (or \`bytes=start-\` or \`bytes=-n\`) to get **206** and a \`Content-Range\`. A range outside the file is **416** with an empty body, \`Content-Range: bytes */<size>\` (or \`bytes */*\` from S3), and \`Accept-Ranges: bytes\`. \`If-None-Match\` equal to the ETag on a full (not partial) response is **304** with an empty body. \`ETag\` and \`Last-Modified\` are set when the store has them.

CORS exposes \`Content-Disposition\`, so the browser can read the download filename.`,
      security: [],
      parameters: [
        { name: 'name', in: 'path', required: true, description: 'Stored file name, not a path. No slashes.', schema: { type: 'string', pattern: '^[\\w][\\w.-]{0,200}$', example: 'logo-sunrise.png' } },
        { name: 'exp', in: 'query', required: false, description: 'Required for a protected file. Expiry as unix milliseconds.', schema: { type: 'integer', example: 1763889000000 } },
        { name: 'sig', in: 'query', required: false, description: 'Required for a protected file. Hex HMAC from GET /api/files/link.', schema: { type: 'string', example: 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12' } },
        { name: 'download', in: 'query', required: false, description: 'When a non-empty string, the response is an attachment saved under this name.', schema: { type: 'string', example: 'Invoice-INV-0007.pdf' } },
        { name: 'Range', in: 'header', required: false, description: 'Optional byte range. `bytes=0-1023`, `bytes=1024-`, or `bytes=-1024`.', schema: { type: 'string', example: 'bytes=0-1048575' } },
        { name: 'If-None-Match', in: 'header', required: false, description: 'Previous ETag. Exact match on a full response returns 304.', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'The whole file.',
          headers: {
            'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
            'Cache-Control': { schema: { type: 'string', example: 'public, max-age=604800' } },
            'Content-Disposition': { schema: { type: 'string' }, description: 'Set for a non-inline type, or when download is set.' },
            ETag: { schema: { type: 'string' } },
          },
          content: {
            'image/png': binary,
            'image/jpeg': binary,
            'image/webp': binary,
            'image/gif': binary,
            'application/pdf': binary,
            'application/octet-stream': binary,
          },
        },
        206: {
          description: 'One byte range. Header Content-Range is `bytes start-end/size`.',
          headers: {
            'Content-Range': { schema: { type: 'string', example: 'bytes 0-1048575/8000000' } },
            'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
          },
          content: {
            'image/png': binary,
            'image/jpeg': binary,
            'image/webp': binary,
            'image/gif': binary,
            'application/pdf': binary,
            'application/octet-stream': binary,
          },
        },
        304: { description: 'If-None-Match matched the ETag. Empty body.' },
        403: json('Protected file without a valid unexpired signature.', err, { error: 'This link has expired or is not valid' }),
        404: { description: 'The name is illegal or the file does not exist. Empty body, no JSON.' },
        416: {
          description: 'The Range is outside the file. Empty body.',
          headers: {
            'Content-Range': { schema: { type: 'string', example: 'bytes */8000000' } },
            'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
          },
        },
        500: ServerError,
      },
    },
  },

  '/api/files/link': {
    get: {
      tags: ['Files'],
      operationId: 'fileLink',
      summary: 'Turn a stored upload path into a URL the browser can open.',
      description: `Any signed-in user. Header \`Cache-Control: no-store\`. Query \`url\` is required and must be exactly \`/uploads/<name>\` where \`name\` passes the upload name rule. Anything else is 404 "File not found".

A public file (no protected prefix) returns \`{ url: "/uploads/<name>" }\` with no expiry and no access check. A protected file is checked, then returned as \`{ url: "/uploads/<name>?exp=<ms>&sig=<hex>", expiresAt }\`. \`expiresAt\` is ISO time 10 minutes ahead. \`exp\` inside the URL is that same moment in unix milliseconds. Open the \`url\` with GET (an image tag or a PDF viewer). Do not send the bearer token to \`/uploads\`.

Who may open a protected file:

- Platform admin (\`superadmin\`): every protected file except client-support attachments (\`cticket-\`).
- Client-support attachments: the client who owns that ticket, or a branch owner, company admin, or agent with \`helpdesk:view\` in the same branch. Otherwise 403 "You do not have access to this file".
- Client documents (\`-doc-\`): \`clients:view\` in that branch, or \`clients:view_team\` when the document belongs to a client in their team.
- Installation photos (\`-step-\`): anyone in that branch except a client.
- Platform-support attachments (\`ticket-\`): \`support:view\`, and the file must be on a ticket of that branch. Missing permission is 403 "You do not have access to this area".
- Quotation PDFs (\`-design-\`): \`proposals:view\`.
- Invoice, receipt, e-way bill, sale bill, credit note PDFs: \`finances:view\`.
- Supplier bills (\`-bill-\`): \`inventory:view\` or \`finances:view\`.
- Loan documents: \`loans:view\`. Subsidy documents: \`subsidies:view\`. Expense bills: \`expenses:view\`.
- Product PDFs (\`-proddoc-\`): \`proposals:view\`, \`inventory:view\`, \`finances:view\`, or \`tasks:view\`, and the file's owner id is this branch, this organization, or a product in this organization.

A branch owner and a company admin pass every permission check above. Anyone else who fails is 403 "You do not have access to this file".

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'url', in: 'query', required: true, description: 'Path stored on the record. Must be exactly `/uploads/<name>`.', schema: { type: 'string', example: '/uploads/665f1c2a3b4d5e6f7a8b9c11-invoice-665f1c2a3b4d5e6f7a8b9c71-INV-0007.pdf' } },
      ],
      responses: {
        200: json('A URL the browser can GET. `expiresAt` is omitted for a public file.', {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'Path plus, for a protected file, `exp` (unix ms) and `sig`.', example: '/uploads/665f1c2a3b4d5e6f7a8b9c11-invoice-665f1c2a3b4d5e6f7a8b9c71-INV-0007.pdf?exp=1763889000000&sig=ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12' },
            expiresAt: { type: 'string', format: 'date-time', description: 'Present only for a protected file. 10 minutes from now.', example: '2026-11-23T08:20:00.000Z' },
          },
        }),
        401: Unauthorized,
        403: json('The user cannot open this protected file.', err, { error: 'You do not have access to this file' }),
        404: json('`url` is missing or is not exactly `/uploads/<safe name>`.', err, { error: 'File not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/files/share-link': {
    get: {
      tags: ['Files'],
      operationId: 'fileShareLink',
      summary: 'Create a 7-day public URL for a protected file the user can already open.',
      description: `Any signed-in user who passes the same access check as \`GET /api/files/link\`. Header \`Cache-Control: no-store\`. Query \`url\` must be exactly \`/uploads/<name>\`. A bad url is 404 "File not found".

Unlike \`/link\`, a public (unprotected) file is not given a short link: the access check fails and the response is 403 "You do not have access to this file". Use \`/link\` or the plain \`/uploads/<name>\` path for logos and avatars.

On success the response is \`{ url, expiresAt }\`. \`url\` is \`/api/public/documents/<token>\` (no query string). \`expiresAt\` is 7 days from this call. Asking again for the same file and branch refreshes that expiry. Give \`url\` to the client; they do not need a bearer token.

Access rules and 403 messages are the same as \`GET /api/files/link\`.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'url', in: 'query', required: true, description: 'Protected file path `/uploads/<name>`.', schema: { type: 'string', example: '/uploads/665f1c2a3b4d5e6f7a8b9c11-invoice-665f1c2a3b4d5e6f7a8b9c71-INV-0007.pdf' } },
      ],
      responses: {
        200: json('Short public path and its expiry.', {
          type: 'object',
          required: ['url', 'expiresAt'],
          properties: {
            url: { type: 'string', example: '/api/public/documents/xY7kL2pQ9mNa' },
            expiresAt: { type: 'string', format: 'date-time', example: '2026-11-30T08:00:00.000Z' },
          },
        }),
        401: Unauthorized,
        403: json('The user cannot open this file, or the file is not a protected upload.', err, { error: 'You do not have access to this file' }),
        404: json('`url` is not exactly `/uploads/<safe name>`.', err, { error: 'File not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/notifications': {
    get: {
      tags: ['Notifications'],
      operationId: 'notificationList',
      summary: 'List the signed-in user\'s inbox, newest first.',
      description: `Any signed-in user. The route only requires a bearer token (a client and a super admin can call it). Rows are only those stored for this user id. Nothing is marked read.

Two query modes:

- Page mode (default, when \`before\` is omitted): \`page\` (default 1, minimum 1) and \`limit\` (default 10, minimum 1, maximum 50). Response is \`{ items, total, page, limit, unread }\`.
- Cursor mode (when \`before\` is sent, even if it is not a valid date): \`limit\` default 30, minimum 1, maximum 100. Items are those with \`createdAt\` strictly before that instant. Response is \`{ items, hasMore, unread }\` and does **not** include \`total\` or \`page\`. An unparseable \`before\` is ignored and the newest rows are returned in the cursor shape.

\`unread\` is the count of rows with \`readAt\` null, not just this page. \`items\` are notification documents.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', required: false, description: 'Page mode only. Default 1. Values below 1 become 1.', schema: { type: 'integer', minimum: 1, default: 1, example: 1 } },
        { name: 'limit', in: 'query', required: false, description: 'Page mode: default 10, max 50. Cursor mode (`before` set): default 30, max 100.', schema: { type: 'integer', minimum: 1, default: 10, example: 10 } },
        { name: 'before', in: 'query', required: false, description: 'ISO date-time. Switches to cursor mode. Items older than this instant.', schema: { type: 'string', format: 'date-time', example: '2026-11-23T08:00:00.000Z' } },
      ],
      responses: {
        200: json('A page of inbox rows, or a cursor page when `before` is set.', {
          type: 'object',
          required: ['items', 'unread'],
          properties: {
            items: { type: 'array', items: notificationSchema },
            total: { type: 'integer', description: 'Page mode only. All rows for this user, read and unread.', example: 12 },
            page: { type: 'integer', description: 'Page mode only.', example: 1 },
            limit: { type: 'integer', description: 'Page mode only.', example: 10 },
            hasMore: { type: 'boolean', description: 'Cursor mode only. True when another row exists after this batch.' },
            unread: { type: 'integer', description: 'Rows with readAt null.', example: 3 },
          },
        }, {
          items: [{
            id: '665f1c2a3b4d5e6f7a8b9c81',
            user: '665f1c2a3b4d5e6f7a8b9c0d',
            company: '665f1c2a3b4d5e6f7a8b9c11',
            type: 'step_status_changed',
            title: 'Installation Step Updated',
            body: 'Structure installation has been marked as Done (Joshi residence).',
            path: '/dashboard/installations/665f1c2a3b4d5e6f7a8b9c71',
            data: { event: 'step_status_changed', installationId: '665f1c2a3b4d5e6f7a8b9c71', installationStepId: '665f1c2a3b4d5e6f7a8b9c72', status: 'done', previousStatus: 'in_progress' },
            eventKey: 'step-status:665f1c2a3b4d5e6f7a8b9c90',
            readAt: null,
            createdAt: '2026-11-23T07:45:00.000Z',
            updatedAt: '2026-11-23T07:45:00.000Z',
          }],
          total: 1,
          page: 1,
          limit: 10,
          unread: 1,
        }),
        401: Unauthorized,
        403: Forbidden,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/notifications/unread-count': {
    get: {
      tags: ['Notifications'],
      operationId: 'notificationUnreadCount',
      summary: 'Return how many inbox rows are still unread.',
      description: `Any signed-in user. No query and no body. \`unread\` counts rows for this user with \`readAt\` null. Use it for a badge; use the list route for the rows.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      responses: {
        200: json('Unread total.', { type: 'object', required: ['unread'], properties: { unread: { type: 'integer', example: 3 } } }, { unread: 3 }),
        401: Unauthorized,
        403: Forbidden,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/notifications/read-all': {
    post: {
      tags: ['Notifications'],
      operationId: 'notificationReadAll',
      summary: 'Mark every unread inbox row for this user as read.',
      description: `Any signed-in user. No body. Sets \`readAt\` on every unread row for this user. Already-read rows stay as they are. The response is \`{ ok: true }\` even when nothing was unread. Other users' rows are not touched.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      responses: {
        200: json('All of this user\'s unread rows are marked read.', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } }, { ok: true }),
        401: Unauthorized,
        403: Forbidden,
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/notifications/{id}/read': {
    post: {
      tags: ['Notifications'],
      operationId: 'notificationRead',
      summary: 'Mark one inbox row as read.',
      description: `Any signed-in user. No body. \`id\` must be a 24-hex id. A value that is not a valid id is 404 "Notification not found".

A valid id that is not this user's row, or that is already read, still returns 200 \`{ ok: true }\` and changes nothing. Only an unread row owned by this user gets \`readAt\` set to now.

${AUTH_401} ${API_LIMIT}`,
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'Notification id.', schema: oid },
      ],
      responses: {
        200: json('The row is read, or there was nothing to change.', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } }, { ok: true }),
        401: Unauthorized,
        403: Forbidden,
        404: json('`id` is not a 24-hex ObjectId.', err, { error: 'Notification not found' }),
        429: RateLimited,
        500: ServerError,
      },
    },
  },

  '/api/company/integrations/meta/callback': {
    get: {
      tags: ['Webhooks'],
      operationId: 'webhookMetaCallback',
      summary: 'Finish Facebook Login and send the browser back to the integrations page.',
      description: `Called by the browser when Meta redirects back. No bearer token. Do not call it from the app yourself. The signed-in company router is a different mount; this URL is the public callback registered in \`app.js\`.

Query keys the handler reads: \`code\`, \`state\`, \`error\`. \`state\` must be the single-use value from the connect call and must be unexpired. It is deleted as soon as it is found.

Success is **302** to the page that started the login (or the company Meta redirect URL). The query is \`meta=connected\`.

When Meta sends \`error\` and the state is still valid, the redirect is \`meta=error\` and \`reason=access_denied\`. When the state is missing in that case, the body is plain text 400 "Meta login was cancelled." (not JSON).

Other \`reason\` values on the error redirect: \`not_configured\`, \`missing_code\`, \`not_authorized\` (the user who started connect is no longer an active branch owner or company admin of that company), \`missing_permissions\`, \`no_pages\`.

Plain text, not JSON, and no redirect:

- 400 "Invalid or expired Meta login session. Start again from Integrations."
- 502 "Meta is temporarily unavailable. Try again from Integrations."
- 500 "Server error completing Meta login."

On success the company's Meta connection is stored (pages and encrypted tokens). If the previously selected Page is still granted, it is subscribed to leadgen and failed leads are queued again.

60 requests per IP per 10 minutes, plus the API-wide 1500 per 5 minutes.`,
      security: [],
      parameters: [
        { name: 'code', in: 'query', required: false, description: 'Authorization code from Meta. Absent when the person cancelled.', schema: { type: 'string' } },
        { name: 'state', in: 'query', required: false, description: 'Single-use OAuth state issued when connect started.', schema: { type: 'string' } },
        { name: 'error', in: 'query', required: false, description: 'Set by Meta when the person denies access. The handler only checks that it is present.', schema: { type: 'string', example: 'access_denied' } },
      ],
      responses: {
        302: {
          description: 'Browser redirect. Location query is `meta=connected`, or `meta=error` and `reason` one of access_denied, not_configured, missing_code, not_authorized, missing_permissions, no_pages.',
          headers: { Location: { schema: { type: 'string' }, description: 'Frontend integrations URL plus the meta query.' } },
        },
        400: { description: 'Plain text, not JSON. "Meta login was cancelled." or "Invalid or expired Meta login session. Start again from Integrations."', content: { 'text/plain': { schema: { type: 'string', example: 'Invalid or expired Meta login session. Start again from Integrations.' } } } },
        429: RateLimited,
        500: { description: 'Plain text. "Server error completing Meta login."', content: { 'text/plain': { schema: { type: 'string', example: 'Server error completing Meta login.' } } } },
        502: { description: 'Plain text. "Meta is temporarily unavailable. Try again from Integrations."', content: { 'text/plain': { schema: { type: 'string', example: 'Meta is temporarily unavailable. Try again from Integrations.' } } } },
      },
    },
  },

  '/api/company/google-leads/webhook': {
    post: {
      tags: ['Webhooks'],
      operationId: 'webhookGoogleAdsLead',
      summary: 'Accept one lead posted by a Google Ads lead-form webhook.',
      description: `Called by Google Ads, not by the app. No bearer token. The company is chosen by \`google_key\` in the JSON body (the key shown on that company's integrations screen). The key is not stored on the lead.

This is the public webhook in \`app.js\`. It is not the signed-in company router.

Success is 200 \`{ "message": "Lead received" }\`. A duplicate \`lead_id\` for that company is also 200 \`{ "message": "Lead already received" }\` so Google stops retrying. These bodies use \`message\`, not \`error\`.

400 \`{ "message": "lead_id is required" }\` when \`lead_id\` is missing. 503 \`{ "message": "Google Ads webhook is not configured" }\` when the key is empty or matches no company. 500 \`{ "message": "Could not store lead" }\`.

There is no zod schema. Column values are clipped to 2000 characters. Standard column ids \`FULL_NAME\`, \`FIRST_NAME\`, \`LAST_NAME\`, \`EMAIL\`, and \`PHONE_NUMBER\` are copied onto the lead. Other columns are kept under their \`column_id\` or \`column_name\`.

240 requests per IP per 60 seconds, plus the API-wide 1500 per 5 minutes. The JSON body limit is 4 MB.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['google_key', 'lead_id'],
              properties: {
                google_key: { type: 'string', description: 'Company webhook key. Required to route the lead. Not stored.', example: 'gads_live_key_from_integrations' },
                lead_id: { type: 'string', description: 'Google lead id. Required. Trimmed.', example: '1234567890' },
                form_id: { type: 'string', description: 'Optional.' },
                campaign_id: { type: 'string' },
                adgroup_id: { type: 'string', description: 'Google field name is adgroup_id.' },
                creative_id: { type: 'string' },
                gcl_id: { type: 'string' },
                is_test: { type: 'boolean', description: 'Optional. Stored as a boolean.', example: false },
                user_column_data: {
                  type: 'array',
                  description: 'Optional. Google lead-form answers.',
                  items: {
                    type: 'object',
                    properties: {
                      column_id: { type: 'string', description: 'Standard ids include FULL_NAME, FIRST_NAME, LAST_NAME, EMAIL, PHONE_NUMBER.', example: 'FULL_NAME' },
                      column_name: { type: 'string', description: 'Used as the key when column_id is absent. Custom questions use their text.' },
                      string_value: { type: 'string', maxLength: 2000, example: 'Meera Joshi' },
                    },
                  },
                },
              },
            },
            example: {
              google_key: 'gads_live_key_from_integrations',
              lead_id: '1234567890',
              form_id: '999',
              campaign_id: '111',
              is_test: false,
              user_column_data: [
                { column_id: 'FULL_NAME', string_value: 'Meera Joshi' },
                { column_id: 'EMAIL', string_value: 'meera@example.com' },
                { column_id: 'PHONE_NUMBER', string_value: '+919876543210' },
              ],
            },
          },
        },
      },
      responses: {
        200: json('Lead stored, or it was already stored. Property is `message`.', { type: 'object', required: ['message'], properties: { message: { type: 'string', enum: ['Lead received', 'Lead already received'] } } }, { message: 'Lead received' }),
        400: json('lead_id missing. Property is `message`, not `error`.', { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }, { message: 'lead_id is required' }),
        429: RateLimited,
        500: json('The lead could not be stored. Property is `message`.', { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }, { message: 'Could not store lead' }),
        503: json('The key is missing or matches no company.', { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }, { message: 'Google Ads webhook is not configured' }),
      },
    },
  },

  '/api/webhooks/meta': {
    get: {
      tags: ['Webhooks'],
      operationId: 'webhookMetaVerify',
      summary: 'Answer Meta\'s webhook verification handshake.',
      description: `Called by Meta when a Page webhook is subscribed. Not called by the app. No bearer token. Mounted before the API rate limit, so the 1500/5 minute limit does not apply. There is no other limiter on this path.

Query names are exactly \`hub.mode\`, \`hub.verify_token\`, and \`hub.challenge\`. \`hub.mode\` must be \`subscribe\`. \`hub.verify_token\` must match a connected company's stored verify token, or the server env \`META_WEBHOOK_VERIFY_TOKEN\`. On success the body is **plain text**: the \`hub.challenge\` string, status 200, \`Content-Type: text/plain\`.

Anything else is 403 JSON \`{ "message": "Webhook verification failed" }\`. The property is \`message\`, not \`error\`.`,
      security: [],
      parameters: [
        { name: 'hub.mode', in: 'query', required: true, description: 'Must be subscribe.', schema: { type: 'string', enum: ['subscribe'], example: 'subscribe' } },
        { name: 'hub.verify_token', in: 'query', required: true, description: 'Verify token configured for the Meta app.', schema: { type: 'string' } },
        { name: 'hub.challenge', in: 'query', required: true, description: 'Echoed back as the response body when the token matches.', schema: { type: 'string', example: '1234567890' } },
      ],
      responses: {
        200: { description: 'Plain text. The body is the hub.challenge value.', content: { 'text/plain': { schema: { type: 'string', example: '1234567890' } } } },
        403: json('Token or mode did not match. Property is `message`.', { type: 'object', required: ['message'], properties: { message: { type: 'string', example: 'Webhook verification failed' } } }, { message: 'Webhook verification failed' }),
      },
    },
    post: {
      tags: ['Webhooks'],
      operationId: 'webhookMetaReceive',
      summary: 'Queue leadgen events that Meta posts for a connected Page.',
      description: `Called by Meta. Not called by the app. No bearer token. Mounted before the API rate limit, so that limit does not apply.

The body is raw (any Content-Type), maximum 1 MB. A larger body is 413 \`{ "error": "Request is too large" }\`. Send header \`X-Hub-Signature-256\` (sha256 HMAC of the raw body with that company's app secret).

The JSON Meta sends is read as \`object\` and \`entry[].changes[]\`. A change is a lead only when \`field\` is \`leadgen\` and \`value\` has numeric \`leadgen_id\`, \`page_id\`, and \`form_id\`. Optional: \`ad_id\`, \`created_time\` (unix seconds).

Responses are mostly plain text, not the app error envelope:

- 200 \`text/plain\` body \`EVENT_RECEIVED\` when \`object\` is not \`page\`, when there are no lead events, or when the events were queued or ignored. A duplicate lead is still 200.
- 400 JSON \`{ "message": "Invalid webhook payload" }\` when the body is not JSON or \`entry\` is not an array.
- 401 JSON \`{ "message": "Invalid webhook signature" }\` when every lead that belongs to a connected Page failed the signature check. If at least one company's signature matches, the response is still 200.
- 500 JSON \`{ "message": "Could not queue webhook event" }\`.

A matching new lead is inserted with processing status \`pending\` and the lead worker is kicked. Leads are routed by Page: the Page must be connected to exactly one company, and the form must be selected on that connection.`,
      security: [],
      parameters: [
        { name: 'X-Hub-Signature-256', in: 'header', required: false, description: 'sha256=<hex> HMAC of the raw body using the app secret of the company that owns the Page. Required for lead events on a connected Page.', schema: { type: 'string', example: 'sha256=ab12cd34' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                object: { type: 'string', description: 'Meta sends page for Page leadgen. Any other object is acknowledged and ignored.', example: 'page' },
                entry: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      changes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            field: { type: 'string', enum: ['leadgen'], example: 'leadgen' },
                            value: {
                              type: 'object',
                              properties: {
                                leadgen_id: { type: 'string', description: 'Digits only.', example: '444555666' },
                                page_id: { type: 'string', description: 'Digits only.', example: '111222333' },
                                form_id: { type: 'string', description: 'Digits only.', example: '777888999' },
                                ad_id: { type: 'string', description: 'Optional.' },
                                created_time: { type: 'integer', description: 'Optional. Unix seconds.' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Plain text EVENT_RECEIVED. The event was queued, was a duplicate, was ignored, or was not a page lead.', content: { 'text/plain': { schema: { type: 'string', example: 'EVENT_RECEIVED' } } } },
        400: json('Body is not a JSON object with an entry array. Property is `message`.', { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }, { message: 'Invalid webhook payload' }),
        401: json('Connected Page leads were not signed with that company\'s app secret. Property is `message`.', { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }, { message: 'Invalid webhook signature' }),
        413: json('Raw body over 1 MB.', err, { error: 'Request is too large' }),
        500: json('The queue write failed. Property is `message`.', { type: 'object', required: ['message'], properties: { message: { type: 'string' } } }, { message: 'Could not queue webhook event' }),
      },
    },
  },
};
