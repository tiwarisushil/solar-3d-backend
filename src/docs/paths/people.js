// Clients, staff, roles, the client portal, platform support tickets, and client help requests.
// Loaded by backend/src/docs/spec.js. Success JSON is the value itself (no { data } wrapper).

const bearer = [{ bearerAuth: [] }];
const ref = (name) => ({ $ref: `#/components/responses/${name}` });
const oid = { $ref: '#/components/schemas/ObjectId' };

const PERMISSIONS = [
  'clients:create', 'clients:delete', 'clients:manage_login', 'clients:update', 'clients:view', 'clients:view_team',
  'expenses:create', 'expenses:delete', 'expenses:update', 'expenses:view',
  'finances:create_bill', 'finances:create_eway_bill', 'finances:create_invoice', 'finances:view',
  'helpdesk:update', 'helpdesk:view',
  'inventory:create', 'inventory:delete', 'inventory:update', 'inventory:view',
  'leads:assign', 'leads:change_status', 'leads:create', 'leads:export', 'leads:update', 'leads:view', 'leads:view_all', 'leads:view_team',
  'loans:update', 'loans:view',
  'proposals:change_client', 'proposals:change_status', 'proposals:create', 'proposals:delete', 'proposals:share', 'proposals:update', 'proposals:view',
  'subsidies:update', 'subsidies:view',
  'support:create', 'support:update', 'support:view',
  'tasks:assign', 'tasks:change_status', 'tasks:create', 'tasks:delete', 'tasks:invoice_parts', 'tasks:update', 'tasks:view', 'tasks:view_team',
];

const WIDE = 'No extra limit on this route. It still counts toward 1500 requests per IP per 5 minutes.';
const UPLOAD_LIMIT = 'File routes also count toward 60 uploads per signed-in user per 10 minutes, and at most 3 uploads in progress for that user. Over either limit: 429, code RATE_LIMITED. The in-progress message is "Too many uploads at once. Wait for the others to finish." The window message is "Too many requests. Try again in N seconds." Headers: RateLimit-Limit, RateLimit-Remaining, Retry-After.';

const idParam = (what) => ({
  name: 'id', in: 'path', required: true, description: what, schema: oid,
});

const pageParams = [
  { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number, starting at 1. A missing or non-numeric value is 1.' },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 }, description: 'Page size. Default 50. Values above 200 are clamped to 200. A missing or non-numeric value is 50. Values below 1 become 1.' },
];

function json(description, schema, example) {
  const media = { schema };
  if (example !== undefined) media.example = example;
  return { description, content: { 'application/json': media } };
}

function err(description, example) {
  return json(description, {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'Message safe to show.' },
      code: { type: 'string' },
      details: { type: 'object', additionalProperties: true },
    },
  }, example);
}

function op({ tag, operationId, summary, description, parameters, requestBody, success, extra }) {
  return {
    tags: [tag],
    operationId,
    summary,
    description,
    security: bearer,
    ...(parameters ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: { ...success, 401: ref('Unauthorized'), 403: ref('Forbidden'), ...extra, 500: ref('ServerError') },
  };
}

const ok = json('The action finished. There is nothing else to read.', {
  type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } },
}, { ok: true });

const dateTime = { type: 'string', format: 'date-time' };
const nullableDate = { type: 'string', format: 'date-time', nullable: true };
const nullableNum = { type: 'number', nullable: true };

const clientLog = {
  type: 'object',
  properties: {
    id: oid,
    at: dateTime,
    action: { type: 'string', description: 'Short code. Creating a client writes client_created.', maxLength: 40 },
    step: { ...oid, nullable: true },
    stepName: { type: 'string' },
    by: { ...oid, nullable: true },
    byName: { type: 'string' },
    byRole: { type: 'string', description: 'Role of the actor: company, branch, agent, client, or empty.' },
    message: { type: 'string' },
    lat: nullableNum,
    lng: nullableNum,
    imageUrl: { type: 'string' },
  },
};

const clientDocument = {
  type: 'object',
  required: ['url'],
  properties: {
    id: { ...oid, description: 'Present on documents already saved. Omit on a new upload result; the server assigns one when the client is saved.' },
    name: { type: 'string', maxLength: 200, description: 'Original file name, trimmed, at most 200 characters.' },
    url: { type: 'string', maxLength: 500, description: 'Stored path, usually /uploads/<file>. An item with an empty url is dropped.' },
    size: { type: 'number', description: 'Bytes. A missing or non-numeric size is stored as 0.' },
    mimetype: { type: 'string', maxLength: 100 },
    uploadedAt: dateTime,
  },
};

const clientBodyProps = {
  name: { type: 'string', maxLength: 120, description: 'Required on create. Saved with the first letter of each word capitalised ("ravi kumar" becomes "Ravi Kumar"). Blank is rejected with "Name is required".' },
  email: { type: 'string', maxLength: 200, description: 'Optional. Blank, null, or omitted on create stores "". When sent, it must look like name@company.com (no ".." and no leading or trailing dot in the local part) or the error is "Enter a valid email address (like name@company.com)". Stored lower case. This email is the portal sign-in name.' },
  phone: { type: 'string', description: 'Optional. Blank stores "". An Indian mobile is stored as 10 digits starting 6–9 (a leading +91, 91, or 0 is removed). Any other country is stored as + and the country code, 8–15 digits, and must not be +91. Error: "Enter a valid mobile number: 10 digits in India, or with the country code elsewhere (like +971 50 123 4567)". At most 20 characters.' },
  pan: { type: 'string', description: 'Optional. Blank stores "". Otherwise 10 characters, stored upper case: 5 letters, 4 digits, 1 letter. The 4th character must be one of A, B, C, F, G, H, J, K, L, P, T. Error: "Enter a valid PAN, like ABCDE1234F".' },
  gstNumber: { type: 'string', description: 'Optional tax number, stored upper case, at most 20 characters. A GSTIN (15 characters: state code 01–38, PAN, entity, Z, check character) or another country\'s tax number (4–20 letters, digits, space, dot, slash, or hyphen, at least two digits, and not shaped like a GSTIN). Error: "Enter a valid tax number, like the GSTIN 27ABCDE1234F1Z5". Sending projectType residential clears this to "" even if a number is sent in the same body.' },
  projectType: { type: 'string', enum: ['residential', 'industrial', 'commercial', 'agricultural'], description: 'Optional on create; the stored default is residential. A value outside the list: "Invalid option: expected one of \\"residential\\"|\\"industrial\\"|\\"commercial\\"|\\"agricultural\\"."' },
  roofType: { type: 'string', enum: ['concrete', 'factory', 'tin_shed', ''], description: 'Optional. "" means not set. Any other value fails validation.' },
  address: { type: 'string', maxLength: 400, description: 'Optional. "Address can be at most 400 characters".' },
  notes: { type: 'string', maxLength: 1000, description: 'Optional. "Notes can be at most 1000 characters".' },
  consumerNumber: { type: 'string', description: 'Optional electricity consumer number. Blank stores "". Otherwise 4–30 characters, letters, digits, hyphen, or slash, starting with a letter or digit. Error: "Enter a valid consumer number (4–30 letters, digits, - or /)".' },
  kwRequired: { type: 'number', minimum: 0.1, maximum: 100000, nullable: true, description: 'Optional required system size in kW. Omit to leave unchanged on update. null or "" clears it (stored null). A number must be from 0.1 to 100000. Errors: "Required kW must be a number", "Required kW must be at least 0.1", "Required kW must be at most 100000".' },
  source: { type: 'string', maxLength: 80, description: 'Optional free text, such as how the client was found. "Source can be at most 80 characters".' },
  referredBy: {
    type: 'object',
    description: 'Optional. On update, sending this object replaces both name and phone. A missing name or phone inside it is stored as "".',
    properties: {
      name: { type: 'string', maxLength: 120, description: 'Person who referred this client. "Enter a name" if the value is not text. At most 120 characters.' },
      phone: { type: 'string', description: 'Same phone rules as the client phone. Blank stores "".' },
    },
  },
  documents: {
    type: 'array',
    description: 'Not in the zod object, but the schema is loose and the service saves this array when the key is present. Omit the key to leave stored documents unchanged. Sending the key replaces the whole list, so include documents you want to keep. Build each new item from POST /api/clients/upload-document. Items without a url are dropped.',
    items: clientDocument,
  },
  createLogin: {
    type: 'boolean',
    description: 'Create only. Not in the zod object; the service reads it. Omit or true: when the client has an email, a portal sign-in is created and returned once in credentials. false: do not create a sign-in. A failed sign-in does not fail the create; see loginError.',
  },
};

const clientRecord = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: oid,
    company: oid,
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    pan: { type: 'string' },
    gstNumber: { type: 'string' },
    projectType: { type: 'string', enum: ['residential', 'industrial', 'commercial', 'agricultural'] },
    roofType: { type: 'string', enum: ['concrete', 'factory', 'tin_shed', ''] },
    address: { type: 'string' },
    notes: { type: 'string' },
    consumerNumber: { type: 'string' },
    kwRequired: nullableNum,
    source: { type: 'string' },
    referredBy: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } } },
    documents: { type: 'array', items: clientDocument },
    logs: { type: 'array', items: clientLog },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const clientExample = {
  id: '665f1c2a3b4d5e6f7a8b9c0d',
  company: '665f1c2a3b4d5e6f7a8b9c01',
  name: 'Ravi Kumar',
  email: 'ravi@example.com',
  phone: '9876543210',
  pan: 'ABCPK1234F',
  gstNumber: '',
  projectType: 'residential',
  roofType: 'concrete',
  address: '12 MG Road, Pune',
  notes: '',
  consumerNumber: 'MH12AB3456',
  kwRequired: 5,
  source: 'Walk-in',
  referredBy: { name: 'Anita Shah', phone: '9123456780' },
  documents: [],
  logs: [{ id: '665f1c2a3b4d5e6f7a8b9c0e', at: '2026-04-01T10:00:00.000Z', action: 'client_created', step: null, stepName: '', by: '665f1c2a3b4d5e6f7a8b9c02', byName: 'Branch Owner', byRole: 'branch', message: 'Ravi Kumar', lat: null, lng: null, imageUrl: '' }],
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
};

const permissionListSchema = {
  type: 'array',
  maxItems: 50,
  description: 'Extra grants on this person only, each area:action from the catalog. This is not the role\'s list. The server unions these with staffRoles into effectivePermissions. Any action adds that area\'s view, except in clients and tasks when the list also contains view_team (there view is left off so "their team" stays narrow). view_all also adds view_team. The stored list is unique and sorted. Send [] when the roles are enough. More than 50 items: "Too big: expected array to have <=50 elements". An unknown string: "Unknown permission" (code VALIDATION, details.fields.permissions).',
  items: { type: 'string', enum: PERMISSIONS },
};

const jobTitleSchema = {
  type: 'array',
  maxItems: 10,
  description: 'Job titles for installation steps, not permission roles. Each value must match the company\'s agentRoles list (GET /api/company, field agentRoles) ignoring case; it is stored with that list\'s spelling. When agentRoles is empty the server uses Site surveyor, Electrician, Installer, Supervisor, Inspector. Unknown title: "Choose roles from your company\'s list (<title> is not defined)". Duplicates are collapsed. At most 10. "Up to 10 entries". Each title at most 40 characters: "Each entry can be at most 40 characters".',
  items: { type: 'string', maxLength: 40 },
};

const staffRoleIdsSchema = {
  type: 'array',
  maxItems: 10,
  description: 'Ids of permission roles from GET /api/roles. At most 10. Each entry at most 24 characters. A value that is not a Mongo id returns 404 "Role not found". An id that is not one of this company\'s roles returns 400 "Choose roles from your company’s list". "Up to 10 entries". "Each entry can be at most 24 characters". "A staff member can have up to 10 roles" if more than 10 distinct ids get past the schema.',
  items: { type: 'string', maxLength: 24 },
};

const agentStats = {
  type: 'object',
  required: ['pending', 'inProgress', 'open', 'done7', 'done30', 'done90', 'doneTotal'],
  properties: {
    pending: { type: 'integer', description: 'Installation steps assigned to them and still pending.' },
    inProgress: { type: 'integer', description: 'Assigned steps in progress.' },
    open: { type: 'integer', description: 'pending + inProgress.' },
    done7: { type: 'integer', description: 'Assigned steps marked done in the last 7 days (by completedAt).' },
    done30: { type: 'integer' },
    done90: { type: 'integer' },
    doneTotal: { type: 'integer', description: 'Assigned steps ever marked done.' },
  },
};

const staffRecord = {
  type: 'object',
  required: ['id', 'email', 'role', 'permissions', 'staffRoles', 'effectivePermissions', 'stats'],
  properties: {
    id: oid,
    email: { type: 'string' },
    role: { type: 'string', enum: ['agent'], description: 'Always agent. This is the account role, not a job title and not a permission role.' },
    name: { type: 'string' },
    company: oid,
    organization: { ...oid, nullable: true },
    client: { nullable: true, description: 'Always null for staff.' },
    manager: { ...oid, nullable: true, description: 'Staff user they report to, or null.' },
    phone: { type: 'string' },
    jobTitle: { type: 'string', description: 'Legacy single title. Empty when roles is in use.' },
    roles: { type: 'array', items: { type: 'string' }, description: 'Job titles (installation-step roles).' },
    staffRoles: {
      type: 'array',
      description: 'Permission roles currently attached, as id and name. Not the raw ids you sent.',
      items: { type: 'object', required: ['id', 'name'], properties: { id: oid, name: { type: 'string' } } },
    },
    permissions: { type: 'array', items: { type: 'string', enum: PERMISSIONS }, description: 'Extra grants stored on this account only. Does not include permissions that come only from staffRoles.' },
    permissionsVersion: { type: 'integer', description: 'Internal name-migration version. Current accounts are 6. Ignore it in the UI.' },
    effectivePermissions: { type: 'array', items: { type: 'string', enum: PERMISSIONS }, description: 'What this person can actually do: the union of permissions and every staffRoles permissions list, sorted. Use this for "can do" labels. Branch owner and company admin are not in this list; they pass every check without it.' },
    photo: { type: 'string', description: 'Portrait path /uploads/... or "".' },
    active: { type: 'boolean', description: 'false means they cannot sign in.' },
    lastLoginAt: { ...dateTime, description: 'Absent until the first sign-in.' },
    tokenVersion: { type: 'integer', description: 'Bumped when the password changes so older tokens die. Not a secret, but not for display.' },
    openSteps: { type: 'integer', description: 'Same number as stats.open.' },
    stats: agentStats,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const staffExample = {
  id: '665f1c2a3b4d5e6f7a8b9c10',
  email: 'meera@example.com',
  role: 'agent',
  name: 'Meera Joshi',
  company: '665f1c2a3b4d5e6f7a8b9c01',
  organization: '665f1c2a3b4d5e6f7a8b9c00',
  client: null,
  manager: null,
  phone: '9988776655',
  jobTitle: '',
  roles: ['Site surveyor'],
  staffRoles: [{ id: '665f1c2a3b4d5e6f7a8b9c20', name: 'Sales executive' }],
  permissions: [],
  permissionsVersion: 6,
  effectivePermissions: ['clients:create', 'clients:update', 'clients:view', 'inventory:view', 'leads:change_status', 'leads:view', 'proposals:change_status', 'proposals:create', 'proposals:share', 'proposals:update', 'proposals:view'],
  photo: '',
  active: true,
  tokenVersion: 0,
  openSteps: 0,
  stats: { pending: 0, inProgress: 0, open: 0, done7: 0, done30: 0, done90: 0, doneTotal: 0 },
  createdAt: '2026-04-02T09:00:00.000Z',
  updatedAt: '2026-04-02T09:00:00.000Z',
};

const roleRecord = {
  type: 'object',
  required: ['id', 'name', 'permissions', 'usedBy'],
  properties: {
    id: oid,
    company: oid,
    name: { type: 'string', description: 'Unique per company, case-insensitive.' },
    description: { type: 'string' },
    permissions: { type: 'array', items: { type: 'string', enum: PERMISSIONS }, description: 'Stored list after normalisation (implied view, sorted). Show this, not the list you sent, if they differ.' },
    permissionsVersion: { type: 'integer', description: 'Internal. Current roles are 6.' },
    usedBy: { type: 'integer', description: 'How many staff accounts include this role. Create returns 0.' },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const attachment = {
  type: 'object',
  properties: {
    id: oid,
    url: { type: 'string', description: 'Path /uploads/<filename>. Fetch it with the files API; it is not a public URL.' },
    name: { type: 'string', description: 'Original file name, at most 200 characters.' },
    mime: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], description: 'Detected from the file bytes, not the browser header.' },
    size: { type: 'integer', description: 'Bytes.' },
  },
};

const ticketMessage = {
  type: 'object',
  properties: {
    id: oid,
    author: oid,
    authorName: { type: 'string' },
    authorRole: { type: 'string', enum: ['superadmin', 'company', 'branch', 'agent', 'client'], description: 'The author\'s account role at send time.' },
    body: { type: 'string' },
    attachments: { type: 'array', items: attachment },
    createdAt: dateTime,
  },
};

const ticketLog = {
  type: 'object',
  properties: {
    id: oid,
    at: dateTime,
    action: { type: 'string', enum: ['created', 'message', 'status_changed', 'reopened'], description: 'Values this API writes.' },
    by: { ...oid, nullable: true },
    byName: { type: 'string' },
    byRole: { type: 'string' },
    message: { type: 'string', description: 'Short audit line, for example "Open → In progress".' },
  },
};

const ticketStatusEnum = ['open', 'in_progress', 'resolved', 'closed'];
const ticketPriorityEnum = ['low', 'normal', 'high'];
const platformCategoryEnum = ['technical', 'billing', 'account', 'other'];
const clientCategoryEnum = ['installation', 'service', 'billing', 'proposal', 'other'];

const personRef = {
  type: 'object',
  nullable: true,
  properties: { id: oid, name: { type: 'string' }, email: { type: 'string' } },
};

const platformTicketCore = {
  id: oid,
  ref: { type: 'string', description: 'TKT- plus the last 6 hex characters of id, upper case. Present on the detail. The list query is lean, so list items omit ref; build it the same way from id.' },
  company: {
    type: 'object',
    nullable: true,
    description: 'Populated branch. List select is name and logo. Detail also includes email and phone.',
    properties: { id: oid, name: { type: 'string' }, logo: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } },
  },
  createdBy: personRef,
  subject: { type: 'string' },
  category: { type: 'string', enum: platformCategoryEnum },
  priority: { type: 'string', enum: ticketPriorityEnum },
  status: { type: 'string', enum: ticketStatusEnum },
  unread: { type: 'integer', description: 'Messages the caller has not opened. For a company user this is the admin\'s replies. For the platform admin it is the company\'s replies. The other side\'s counter is not returned.' },
  lastMessageAt: dateTime,
  createdAt: dateTime,
  updatedAt: dateTime,
};

const { ref: _listOmitsRef, ...platformTicketListFields } = platformTicketCore;

const platformTicketDetail = {
  type: 'object',
  properties: {
    ...platformTicketCore,
    messages: { type: 'array', items: ticketMessage },
    logs: { type: 'array', items: ticketLog },
  },
};

const clientTicketDetail = {
  type: 'object',
  properties: {
    id: oid,
    ref: { type: 'string', description: 'REQ- plus the last 6 hex characters of id, upper case.', example: 'REQ-9C0D1E' },
    company: { ...oid, description: 'Branch id. Not a populated company.' },
    client: { type: 'object', properties: { id: oid, name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', description: 'Present on the detail. The list select is name and phone only, so email is absent there.' } } },
    createdBy: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['superadmin', 'company', 'branch', 'agent', 'client'] } } },
    subject: { type: 'string' },
    category: { type: 'string', enum: clientCategoryEnum },
    priority: { type: 'string', enum: ticketPriorityEnum },
    status: { type: 'string', enum: ticketStatusEnum },
    messages: { type: 'array', items: ticketMessage },
    logs: { type: 'array', items: ticketLog },
    unread: { type: 'integer', description: 'For the client, company replies not yet opened. For the company, client replies not yet opened. 0 after GET of this record.' },
    lastMessageAt: dateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const fileField = {
  type: 'array',
  maxItems: 5,
  description: 'Form field name files. Up to 5 files, each at most 10 MB. Allowed types PNG, JPG, WebP, or PDF. The bytes are checked, not just the header. Wrong type at the filter: "Attach a PNG, JPG, WebP image or a PDF". Bytes that are not really that type: "That file is not a valid PNG, JPG, WebP image or PDF". Too large: "That file is too large". Wrong field name or more than 5 files: multer\'s own message ("Unexpected field" or "Too many files").',
  items: { type: 'string', format: 'binary' },
};

const ticketTextProps = {
  subject: { type: 'string', minLength: 3, maxLength: 150, description: 'Required on create. Trimmed. "Subject is required", "Subject must be at least 3 characters", "Subject can be at most 150 characters".' },
  body: { type: 'string', maxLength: 4000, description: 'Message text. Optional when a file is attached. "Message can be at most 4000 characters". If body is empty, a message string is also read (loose schema).' },
  category: { type: 'string', description: 'Optional. Invalid value: "Invalid option: expected one of ...".' },
  priority: { type: 'string', enum: ticketPriorityEnum, description: 'Optional. Default normal. Invalid: "Invalid option: expected one of \\"low\\"|\\"normal\\"|\\"high\\"."' },
};

function multipartTicket(schema, example) {
  return {
    required: true,
    description: 'Send multipart/form-data when attaching files. Send application/json when there is no file. Text fields are plain strings in the form. A message needs text or at least one file.',
    content: {
      'multipart/form-data': { schema, encoding: { files: { contentType: 'image/png, image/jpeg, image/webp, application/pdf' } } },
      'application/json': { schema: { ...schema, properties: { ...schema.properties, files: undefined } }, example },
    },
  };
}

const portalProposal = {
  type: 'object',
  properties: {
    id: oid,
    name: { type: 'string' },
    type: { type: 'string', enum: ['3d', 'quick'], description: '3d has a saved layout. quick is products and packages only.' },
    status: { type: 'string', enum: ['proposed', 'reproposed', 'negotiation', 'won', 'lost'], description: 'Drafts are never returned.' },
    updatedAt: dateTime,
    createdAt: dateTime,
    summary: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        kwp: { type: 'number' },
        panels: { type: 'number' },
        annualKwh: { type: 'number' },
        cost: { type: 'number', description: 'Fallback total when summary.pricing.total is absent.' },
      },
    },
    total: { type: 'number', description: 'summary.pricing.total when that number exists, otherwise summary.cost. Rounded to 2 decimals.' },
    subsidy: {
      nullable: true,
      description: 'null when the proposal has no subsidy.',
      type: 'object',
      properties: { enabled: { type: 'boolean', enum: [true] }, central: { type: 'number' }, state: { type: 'number' } },
    },
    clientResponse: {
      nullable: true,
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['accepted', 'rejected', 'changes_requested'] },
        note: { type: 'string' },
        respondedAt: dateTime,
      },
    },
    reviewInvite: {
      nullable: true,
      description: 'Set when the company asked the client to look at an updated proposal. Cleared once the client responds.',
      type: 'object',
      properties: { message: { type: 'string' }, sentAt: dateTime },
    },
    canRespond: { type: 'boolean', description: 'true only when status is proposed, reproposed, or negotiation and clientResponse is null.' },
  },
};

const amcRequest = {
  type: 'object',
  properties: {
    id: oid,
    packageName: { type: 'string' },
    requestedDate: dateTime,
    note: { type: 'string' },
    status: { type: 'string', enum: ['requested', 'assigned', 'completed', 'cancelled'] },
    requestedAt: dateTime,
    byCompany: { type: 'boolean', description: 'true when the company booked this visit for the client. The client cannot change those dates.' },
    assignee: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } },
  },
};

const amcPackages = {
  type: 'object',
  properties: {
    currency: { type: 'string', description: 'Company currency, INR when unset.', example: 'INR' },
    hasCatalog: { type: 'boolean', description: 'false when the company has no AMC templates. The proposal list then sends null instead of this object. The proposal detail always sends the object.' },
    canRequest: { type: 'boolean', description: 'true when the proposal is proposed, reproposed, negotiation, or won.' },
    included: {
      type: 'array',
      description: 'Mandatory visits the company schedules. Nothing to request.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          visit: {
            nullable: true,
            type: 'object',
            properties: {
              dueDate: nullableDate,
              status: { type: 'string', enum: ['pending', 'completed'] },
              completedAt: nullableDate,
              assignee: { nullable: true, type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
      },
    },
    services: {
      type: 'array',
      description: 'Optional packages the client can request, newest request first. Cancelled requests are omitted.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          requests: { type: 'array', items: amcRequest },
        },
      },
    },
  },
};

const loanStep = {
  type: 'object',
  description: 'Documents on the step are not returned to the client.',
  properties: {
    id: oid,
    name: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
    remark: { type: 'string', description: 'Shown to the client.' },
    completedAt: nullableDate,
  },
};

const paymentRow = {
  type: 'object',
  description: 'A money-received row on this proposal (a receipt, a bill payment, or an older invoice payment).',
  properties: {
    id: oid,
    company: oid,
    design: { ...oid, nullable: true },
    client: { ...oid, nullable: true },
    ewayBill: { ...oid, nullable: true },
    bill: { ...oid, nullable: true },
    billTo: { nullable: true, type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' } } },
    title: { type: 'string' },
    receiptNo: { type: 'string', description: 'RCPT-… for a receipt, or the related document number.' },
    amount: { type: 'number' },
    refunded: { type: 'number' },
    mode: { type: 'string', enum: ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'] },
    reference: { type: 'string' },
    receivedOn: dateTime,
    note: { type: 'string' },
    reason: { type: 'string' },
    receivedByName: { type: 'string' },
    contractTotal: { type: 'number' },
    balanceAfter: { type: 'number' },
    pdfName: { type: 'string', description: 'Stored PDF name when one was archived. Empty when there is none.' },
    createdByName: { type: 'string' },
    idempotencyKey: { type: 'string' },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const portalBill = {
  type: 'object',
  description: 'A bill on this proposal that is not void. ewayBills and invoice are populated.',
  properties: {
    id: oid,
    company: oid,
    design: { ...oid, nullable: true },
    client: oid,
    billNo: { type: 'string' },
    issuedOn: dateTime,
    title: { type: 'string' },
    ewayBills: { type: 'array', items: { type: 'object', properties: { id: oid, ewayNo: { type: 'string' }, issuedOn: dateTime, total: { type: 'number' } } } },
    services: { type: 'array', items: { type: 'object', properties: { chargeId: { ...oid, nullable: true }, name: { type: 'string' }, description: { type: 'string' }, hsn: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, rate: { type: 'number' }, gstPercent: { type: 'number' } } } },
    pricing: { type: 'object', nullable: true, description: 'Frozen price breakdown stored when the bill was issued. This API does not define the line-item keys.' },
    total: { type: 'number' },
    paid: { type: 'object', properties: { amount: { type: 'number' }, mode: { type: 'string', enum: ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'] }, reference: { type: 'string' }, receivedOn: dateTime, note: { type: 'string' } } },
    payment: { ...oid, nullable: true },
    creditedTotal: { type: 'number' },
    status: { type: 'string', enum: ['paid', 'invoiced'] },
    invoice: { nullable: true, type: 'object', properties: { id: oid, invoiceNo: { type: 'string' } } },
    pdfName: { type: 'string' },
    billToCompany: { type: 'string' },
    details: { type: 'object', nullable: true, description: 'Optional reference and delivery text stored on the bill.' },
    termsAndConditions: { type: 'string' },
    createdByName: { type: 'string' },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const portalInvoice = {
  type: 'object',
  nullable: true,
  description: 'The latest non-void sales invoice on this proposal, or null. AMC-parts invoices are not this field.',
  properties: {
    id: oid,
    company: oid,
    design: { ...oid, nullable: true },
    client: { ...oid, nullable: true },
    invoiceNo: { type: 'string' },
    issuedOn: dateTime,
    title: { type: 'string' },
    total: { type: 'number' },
    pricing: { type: 'object', nullable: true, description: 'Frozen when the invoice was issued. Line-item keys are whatever was stored.' },
    termsAndConditions: { type: 'string' },
    pdfName: { type: 'string' },
    status: { type: 'string', enum: ['issued'] },
    kind: { type: 'string', enum: ['sale', 'amc_parts'], description: 'This field is a sales invoice (kind sale), or an older row with no kind that counts as a sale.' },
    billToCompany: { type: 'string' },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
};

const portalAmcVisit = {
  type: 'object',
  properties: {
    id: oid,
    name: { type: 'string' },
    daysAfterInstallation: { type: 'integer', nullable: true },
    kind: { type: 'string', enum: ['mandatory', 'optional'] },
    price: { type: 'number' },
    description: { type: 'string' },
    dueDate: nullableDate,
    clientRequestedDate: nullableDate,
    workflowStatus: { type: 'string', enum: ['scheduled', 'requested', 'assigned', 'completed', 'cancelled'] },
    assignee: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } },
    status: { type: 'string', enum: ['pending', 'completed'] },
    completedAt: nullableDate,
    completedByName: { type: 'string' },
    completionNote: { type: 'string' },
    criteria: { type: 'array', items: { type: 'object', properties: { id: oid, label: { type: 'string' }, checked: { type: 'boolean' }, note: { type: 'string' } } } },
  },
};

const portalProposalDetail = {
  type: 'object',
  required: ['proposal', 'client', 'total', 'paid', 'balance', 'payments', 'bills', 'amc', 'amcPackages'],
  properties: {
    proposal: { allOf: [portalProposal, { type: 'object', properties: { pricing: { type: 'object', nullable: true, description: 'Price breakdown stored on the proposal. The only key this API reads is total (number). Other keys are whatever the designer saved. null when there is no breakdown.' } } }] },
    client: { type: 'object', properties: { id: oid, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' }, pan: { type: 'string' } } },
    total: { type: 'number' },
    paid: { type: 'number', description: 'Sum of payment amounts on this proposal, rounded to 2 decimals.' },
    balance: { type: 'number', nullable: true, description: 'total - paid when status is won, otherwise null.' },
    payments: { type: 'array', items: paymentRow },
    bills: { type: 'array', items: portalBill },
    invoice: portalInvoice,
    amc: { type: 'object', properties: { installationCompletedAt: nullableDate, visits: { type: 'array', items: portalAmcVisit } } },
    amcPackages,
  },
};

const portalClient = {
  type: 'object',
  properties: { id: oid, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' }, pan: { type: 'string' } },
};

const viewerPanel = {
  type: 'object',
  description: 'A panel the 3D viewer can size. price is always 0 here.',
  properties: {
    id: oid, brand: { type: 'string' }, model: { type: 'string' }, watts: { type: 'number' }, length: { type: 'number' }, width: { type: 'number' }, warrantyMonths: { type: 'number' }, hsnCode: { type: 'string' }, gstPercent: { type: 'number' }, attributes: { type: 'object', additionalProperties: true }, price: { type: 'number', enum: [0] }, manufactureYear: { type: 'integer', nullable: true }, warrantyYears: { type: 'integer' }, categoryName: { type: 'string' }, parentId: { type: 'string' }, parentName: { type: 'string' }, parentOrder: { type: 'integer' },
  },
};

const viewerPillar = {
  type: 'object',
  description: 'A mounting pole. pricePerFt is always 0 here.',
  properties: {
    id: oid, name: { type: 'string' }, shape: { type: 'string', enum: ['l-shape', 'cylindrical', 'square'] }, pricePerFt: { type: 'number', enum: [0] }, hsnCode: { type: 'string' }, gstPercent: { type: 'number' }, categoryName: { type: 'string' }, parentId: { type: 'string' }, parentName: { type: 'string' }, parentOrder: { type: 'integer' },
  },
};

const leadField = {
  type: 'object',
  required: ['key', 'label', 'type', 'required'],
  properties: {
    key: { type: 'string', description: 'Send the answer under this key. Fixed keys are name, phone, address.' },
    label: { type: 'string' },
    type: { type: 'string', enum: ['text', 'textarea', 'number', 'phone', 'email', 'select', 'multiselect', 'date', 'yesno'] },
    required: { type: 'boolean' },
    fixed: { type: 'boolean', description: 'true on Name, Phone, and Address. Absent on the company\'s own fields.' },
    help: { type: 'string', description: 'Hint. Present on the company\'s own fields (may be "").' },
    options: { type: 'array', items: { type: 'string' }, description: 'Choices for select and multiselect. Empty otherwise. Present on the company\'s own fields.' },
  },
};

export default {
  '/api/clients': {
    get: op({
      tag: 'Clients',
      operationId: 'clientList',
      summary: 'List clients in this branch',
      description: [
        'Who: a signed-in branch owner (`role: branch`), company admin (`role: company`), or staff (`role: agent`).',
        'Gate: the mount requires any Clients permission (`withAreaAccess(\'clients\')`). This route then requires `clients:view` or `clients:view_team`. Missing it: 403 "You need the “Clients › View” or “Clients › Their team’s clients” permission. Ask your company admin." No Clients permission at all: 403 "You don\'t have access to Clients. Ask your company admin." Branch owner and company admin pass both checks.',
        '`clients:view` returns every client in the branch. `clients:view_team` without `clients:view` returns only clients tied to the caller or their direct reports: a lead assigned to that team which was converted, or an installation or AMC visit assigned to that team. Anyone else is omitted from this list and 404 "Client not found" on routes that take an id.',
        'Search `q` matches name, email, phone, address, consumer number, source, and the referrer\'s name (case-insensitive, first 100 characters). `from` and `to` are inclusive UTC dates `YYYY-MM-DD` on `createdAt`. A date that is not that shape is ignored. Newest first.',
        'Each item is the full client document plus `designs` (count of proposals, drafts included) and `hasLogin`.',
        WIDE,
      ].join('\n\n'),
      parameters: [
        ...pageParams,
        { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 100 }, description: 'Search text. Blank returns the unfiltered page (still scoped to the team when that applies).' },
        { name: 'from', in: 'query', required: false, schema: { type: 'string', example: '2026-04-01' }, description: 'Created on or after this UTC date (YYYY-MM-DD).' },
        { name: 'to', in: 'query', required: false, schema: { type: 'string', example: '2026-04-30' }, description: 'Created on or before this UTC date (YYYY-MM-DD), through 23:59:59.999Z.' },
      ],
      success: {
        200: json('One page of clients.', {
          type: 'object',
          required: ['items', 'total', 'page', 'limit'],
          properties: {
            items: { type: 'array', items: { allOf: [clientRecord, { type: 'object', properties: { designs: { type: 'integer' }, hasLogin: { type: 'boolean' } } }] } },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        }, { items: [{ ...clientExample, designs: 2, hasLogin: true }], total: 1, page: 1, limit: 50 }),
      },
    }),
    post: op({
      tag: 'Clients',
      operationId: 'clientCreate',
      summary: 'Create a client',
      description: [
        'Who: branch owner, company admin, or staff with `clients:create`. 403 "You need the “Clients › Create” permission. Ask your company admin."',
        'Requires `name`. Other keys are optional. Extra JSON keys are ignored except `documents` and `createLogin`, which the service reads. Omit `createLogin` or send true and, when `email` is set, a portal password is generated and returned once in `credentials` (10 characters, no 0, O, 1, l, or I). Only the hash is stored. Send `createLogin: false` to skip that. If the email is already a sign-in, the client is still created (201) and `loginError` is "That email is already used by another account, so a login cannot be created for it" with `hasLogin: false`.',
        'Side effects: counts against the plan\'s client cap across every branch. Adds a `client_created` log. Residential `projectType` stores `gstNumber` as "".',
        'Errors: 400 "Your company has reached its plan limit of N clients, counted across all branches. Ask your company admin to upgrade the plan to add more." Plus the field messages on each property.',
        WIDE,
      ].join('\n\n'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: clientBodyProps }, example: { name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9876543210', projectType: 'residential', roofType: 'concrete', address: '12 MG Road, Pune', kwRequired: 5, source: 'Walk-in', referredBy: { name: 'Anita Shah', phone: '9123456780' }, createLogin: true } } },
      },
      success: {
        201: json('The created client. `designs` is 0. `credentials` is present only when a portal sign-in was just created. `loginError` is present only when that sign-in could not be created.', {
          allOf: [clientRecord, { type: 'object', properties: {
            designs: { type: 'integer', enum: [0] },
            hasLogin: { type: 'boolean' },
            credentials: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string', description: 'Shown once. It cannot be read again. Reset with POST /api/clients/{id}/login.' } } },
            loginError: { type: 'string' },
          } }],
        }, { ...clientExample, designs: 0, hasLogin: true, credentials: { email: 'ravi@example.com', password: 'K7mN2pQx4R' } }),
      },
      extra: { 400: ref('ValidationError') },
    }),
  },

  '/api/clients/upload-document': {
    post: op({
      tag: 'Clients',
      operationId: 'clientUploadDocument',
      summary: 'Upload a client document',
      description: [
        'Who: branch owner, company admin, or staff with `clients:create` or `clients:update`. 403 "You need the “Clients › Create” or “Clients › Edit” permission. Ask your company admin."',
        'Does not attach the file to a client. Put the returned object into `documents` on POST /api/clients or PUT /api/clients/{id}.',
        'Multipart field name `file`. One file. PNG, JPG, WebP, or PDF. At most 30 MB. Wrong type: "Upload a PNG, JPG, WebP image or a PDF". Bytes that are not really that type: "That file is not a valid PNG, JPG, WebP image or PDF". Too large: "That file is too large". No file: 400 "Please choose a file to upload".',
        UPLOAD_LIMIT,
        WIDE,
      ].join('\n\n'),
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'PNG, JPG, WebP, or PDF. Max 30 MB.' } } },
            encoding: { file: { contentType: 'image/png, image/jpeg, image/webp, application/pdf' } },
          },
        },
      },
      success: {
        200: json('Metadata to store on the client.', clientDocument, { name: 'electricity-bill.pdf', url: '/uploads/665f1c2a3b4d5e6f7a8b9c01-doc-ab12cd34.pdf', size: 182044, mimetype: 'application/pdf', uploadedAt: '2026-04-02T09:30:00.000Z' }),
      },
      extra: { 400: err('Missing file, wrong type, or too large.', { error: 'Please choose a file to upload' }), 429: ref('RateLimited') },
    }),
  },

  '/api/clients/{id}': {
    get: op({
      tag: 'Clients',
      operationId: 'clientGet',
      summary: 'Get one client',
      description: [
        'Who: `clients:view` or `clients:view_team` (branch owner and company admin pass). Same team scope as the list: a client outside the team is 404 "Client not found", including a bad id.',
        'Returns the client plus `hasLogin`. Does not include the `designs` count; use the list or the overview for that.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Client id.')],
      success: { 200: json('The client.', { allOf: [clientRecord, { type: 'object', required: ['hasLogin'], properties: { hasLogin: { type: 'boolean' } } }] }, { ...clientExample, hasLogin: true }) },
      extra: { 404: ref('NotFound') },
    }),
    put: op({
      tag: 'Clients',
      operationId: 'clientUpdate',
      summary: 'Update a client',
      description: [
        'Who: `clients:update`. 403 "You need the “Clients › Edit” permission. Ask your company admin." Team scope still applies (404 outside the team).',
        'Partial. Omit a key to leave it unchanged. Send `documents` only when replacing the whole list. Send `referredBy` only when replacing both name and phone.',
        'Email: sending `email` updates the client and, when a portal sign-in exists, the sign-in name. Clearing it while a sign-in exists: 400 "This client has a sign-in, so their email cannot be removed. Remove the sign-in first." Changing it to an email another account uses: 409 "That email is already used by another account". A changed sign-in email revokes that client\'s sessions. Sending `name` also renames the portal user.',
        'Sending `projectType: residential` clears `gstNumber`.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Client id.')],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', description: 'Every field is optional. Omit a key to leave it unchanged.', properties: { ...clientBodyProps, createLogin: undefined } }, example: { phone: '9876543211', notes: 'Prefers morning calls' } } },
      },
      success: { 200: json('The updated client plus hasLogin.', { allOf: [clientRecord, { type: 'object', properties: { hasLogin: { type: 'boolean' } } }] }, { ...clientExample, hasLogin: true, phone: '9876543211', notes: 'Prefers morning calls' }) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 409: ref('Conflict') },
    }),
    delete: op({
      tag: 'Clients',
      operationId: 'clientDelete',
      summary: 'Delete a client',
      description: [
        'Who: `clients:delete`. 403 "You need the “Clients › Delete” permission. Ask your company admin."',
        'Side effects: deletes the client\'s proposals and installations, their help requests and attachments, and their portal sign-in (sessions revoked). Money documents are never deleted.',
        '400 "This client has e-way bills, bills or invoices, so it cannot be deleted. Cancel any open e-way bills first." when any non-cancelled e-way bill, payment, bill, or invoice exists (a void bill still blocks).',
        '403 "This client has proposals. Deleting the client deletes them too, which needs the Proposals “Delete” permission." when proposals exist and the caller lacks `proposals:delete`. Branch owner and company admin pass.',
        '403 "This client has installations. Deleting the client deletes them too, which needs the Installations “Delete” permission." when an installation exists and the caller lacks `tasks:delete`.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Client id.')],
      success: { 200: ok },
      extra: { 400: err('The client has money records and cannot be deleted.', { error: 'This client has e-way bills, bills or invoices, so it cannot be deleted. Cancel any open e-way bills first.' }), 404: ref('NotFound') },
    }),
  },

  '/api/clients/{id}/overview': {
    get: op({
      tag: 'Clients',
      operationId: 'clientOverview',
      summary: 'Client page: proposals, work, money, loans, AMC, tickets',
      description: [
        'Who: `clients:view` or `clients:view_team`. Team scope applies (404 outside it).',
        'The profile block is only id and name. Load the form with GET /api/clients/{id}.',
        'Proposals are always included (every status, including draft), newest update first. `value` is the proposal total (`pricing.total` or `summary.cost`).',
        'Other blocks are null when the caller lacks that area\'s `view`. `view_team` does not unlock them. Branch owner and company admin see every block.',
        '- `installations` and `amc`: `tasks:view`',
        '- `billing`: `finances:view`',
        '- `loans`: `loans:view`',
        '- `subsidies`: `subsidies:view`',
        '- `tickets`: `helpdesk:view` (up to 50 of this client\'s help requests, newest message first). These rows have no unread count.',
        '- `expenses`: `expenses:view`',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Client id.')],
      success: {
        200: json('Blocks the caller may see. A hidden block is null, not an empty list.', {
          type: 'object',
          required: ['client', 'proposals'],
          properties: {
            client: { type: 'object', properties: { id: oid, name: { type: 'string' } } },
            proposals: { type: 'array', items: { type: 'object', properties: {
              id: oid, name: { type: 'string' }, status: { type: 'string', enum: ['draft', 'proposed', 'reproposed', 'negotiation', 'won', 'lost'] }, type: { type: 'string', enum: ['3d', 'quick'] }, kwp: { type: 'number' }, value: { type: 'number' }, loanRequired: { type: 'boolean' }, subsidy: { type: 'boolean' }, createdAt: dateTime,
            } } },
            installations: { nullable: true, type: 'array', items: { type: 'object', properties: {
              id: oid,
              design: { type: 'object', properties: { id: oid, name: { type: 'string' } } },
              status: { type: 'string', enum: ['active', 'completed'] },
              startedAt: dateTime,
              installationCompletedAt: nullableDate,
              done: { type: 'integer' },
              total: { type: 'integer' },
              current: { nullable: true, description: 'First step that is not done, or null when every step is done.', type: 'object' },
              steps: { type: 'array', items: { type: 'object', properties: {
                id: oid, name: { type: 'string' }, index: { type: 'integer', description: '1-based position.' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, assignee: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } }, startedAt: nullableDate, completedAt: nullableDate, stuck: { type: 'boolean', description: 'true when in progress and started more than 7 days ago.' },
              } } },
            } } },
            billing: { nullable: true, type: 'object', properties: {
              total: { type: 'number', description: 'Sum of won proposal totals.' },
              paid: { type: 'number' },
              balance: { type: 'number' },
              rows: { type: 'array', description: 'Won proposals only.', items: { type: 'object', properties: { id: oid, name: { type: 'string' }, total: { type: 'number' }, paid: { type: 'number' }, balance: { type: 'number' }, lastPaidOn: nullableDate } } },
              payments: { type: 'array', items: { type: 'object', properties: { id: oid, design: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } }, amount: { type: 'number' }, mode: { type: 'string', enum: ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'] }, receivedOn: dateTime, receiptNo: { type: 'string' } } } },
              invoices: { type: 'array', items: { type: 'object', properties: { id: oid, design: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } }, invoiceNo: { type: 'string' }, total: { type: 'number' }, issuedOn: dateTime, hasPdf: { type: 'boolean' } } } },
            } },
            loans: { nullable: true, type: 'array', items: { type: 'object', properties: { id: oid, design: { type: 'object', properties: { id: oid, name: { type: 'string' } } }, status: { type: 'string', enum: ['in_progress', 'completed', 'rejected'] }, lender: { type: 'string' }, amount: nullableNum, done: { type: 'integer' }, total: { type: 'integer' }, currentStep: { type: 'string' }, updatedAt: dateTime } } },
            subsidies: { nullable: true, type: 'array', items: { type: 'object', properties: { id: oid, design: { type: 'object', properties: { id: oid, name: { type: 'string' } } }, status: { type: 'string', enum: ['in_progress', 'completed', 'rejected'] }, scheme: { type: 'string' }, expected: { type: 'number', description: 'centralAmount + stateAmount.' }, received: nullableNum, done: { type: 'integer' }, total: { type: 'integer' }, currentStep: { type: 'string' }, updatedAt: dateTime } } },
            amc: { nullable: true, type: 'array', description: 'This client\'s visits. Incomplete first, then soonest daysLeft.', items: { type: 'object', properties: {
              id: { type: 'string' }, projectId: { ...oid, nullable: true }, name: { type: 'string' }, kind: { type: 'string', enum: ['mandatory', 'optional'] }, free: { type: 'boolean' }, dueDate: nullableDate, daysLeft: { type: 'integer', nullable: true }, booked: { type: 'boolean' }, status: { type: 'string', enum: ['pending', 'completed'] }, assignee: { nullable: true, type: 'object', properties: { id: { type: 'string', nullable: true }, name: { type: 'string' } } }, completedAt: nullableDate, design: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } },
            } } },
            tickets: { nullable: true, type: 'array', description: 'Help requests with this client (REQ- conversations). No unread field on these rows; use GET /api/client-tickets for that.', items: { type: 'object', properties: { id: oid, ref: { type: 'string', example: 'REQ-9C0D1E' }, subject: { type: 'string' }, status: { type: 'string', enum: ticketStatusEnum }, updatedAt: dateTime, messageCount: { type: 'integer' } } } },
            expenses: { nullable: true, type: 'object', properties: { total: { type: 'number' }, rows: { type: 'array', items: { type: 'object', properties: { design: { type: 'object', properties: { id: oid, name: { type: 'string' } } }, total: { type: 'number' }, count: { type: 'integer' }, last: nullableDate } } } } },
          },
        }, {
          client: { id: '665f1c2a3b4d5e6f7a8b9c0d', name: 'Ravi Kumar' },
          proposals: [{ id: '665f1c2a3b4d5e6f7a8b9c30', name: 'Rooftop 5 kW', status: 'won', type: '3d', kwp: 5, value: 280000, loanRequired: true, subsidy: true, createdAt: '2026-04-01T10:00:00.000Z' }],
          installations: null, billing: null, loans: null, subsidies: null, amc: null, tickets: null, expenses: null,
        }),
      },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/clients/{id}/login': {
    post: op({
      tag: 'Clients',
      operationId: 'clientCreateLogin',
      summary: 'Create or reset the client portal password',
      description: [
        'Who: `clients:manage_login`. 403 "You need the “Clients › Portal login” permission. Ask your company admin."',
        'No body. Uses the email already on the client. Creates the portal user, or resets the password and turns the account back on if one exists. The password is returned once.',
        'Side effects on reset: email on the sign-in is updated to the client email, name is updated, tokenVersion bumps, every existing session is revoked.',
        '400 "Add the client\'s email address first — it is their sign-in name" when the client has no email.',
        '409 "That email is already used by another account, so a login cannot be created for it" on first create, or "That email is already used by another account" on reset when the new email belongs to someone else.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Client id.')],
      success: { 201: json('Sign-in to hand to the client. This is both the first create and a later reset.', { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } }, { email: 'ravi@example.com', password: 'K7mN2pQx4R' }) },
      extra: { 400: err('The client has no email.', { error: 'Add the client\'s email address first — it is their sign-in name' }), 404: ref('NotFound'), 409: ref('Conflict') },
    }),
    delete: op({
      tag: 'Clients',
      operationId: 'clientDeleteLogin',
      summary: 'Remove the client portal sign-in',
      description: [
        'Who: `clients:manage_login`. Same 403 as create.',
        'Deletes the portal user and revokes their sessions. The client record stays. Calling it when there is no sign-in still returns `{ ok: true }`.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Client id.')],
      success: { 200: ok },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/agents': {
    get: op({
      tag: 'Staff',
      operationId: 'staffList',
      summary: 'List staff in this branch',
      description: [
        'Who: branch owner (`role: branch`) or company admin (`role: company`) only. The mount is `companyOnly`. Staff (`role: agent`) get 403 "You do not have access to this area" even if they manage other people. There is no staff permission that opens this route.',
        'Returns every staff account in the branch, newest first, each with workload stats. Not paginated.',
        '`permissions` are extra grants on that account. `staffRoles` are named permission sets. `effectivePermissions` is the union the account can actually use. `roles` are job titles for installation steps.',
        WIDE,
      ].join('\n\n'),
      success: { 200: json('All staff accounts.', { type: 'array', items: staffRecord }, [staffExample]) },
    }),
    post: op({
      tag: 'Staff',
      operationId: 'staffCreate',
      summary: 'Create a staff account',
      description: [
        'Who: branch owner or company admin only (`companyOnly`). Staff cannot call this.',
        'What the staff form sends:',
        '- `name`, `email`, `password` (required). Password is 8–200 characters and must contain a letter and a number. "Password must be at least 8 characters", "Password is too long", "Password needs at least one letter and one number". Email is stored lower case. "Email is required", "Enter a valid email address (like name@company.com)".',
        '- `phone` optional, same phone rules as a client.',
        '- `roles`: job titles from the company\'s `agentRoles` (GET /api/company). These decide which installation steps the person can be assigned. They are not permissions. Omit or [] for none.',
        '- `staffRoles`: ids from GET /api/roles. These are the named permission sets. Omit or [] for none. Do not copy a role\'s permissions into `permissions`.',
        '- `permissions`: extra `area:action` strings for this person only, on top of the roles. Omit or [] when the roles are enough. The response `effectivePermissions` is the union. The stored `permissions` may gain an implied `view` (and `view_team` when you sent `view_all`). In `clients` and `tasks`, a list that includes `view_team` does not also gain `view`.',
        '- `manager`: id of another active staff user in this branch, or null. Omit for none. "Choose a manager from this branch’s staff". "A person cannot report to themselves" does not apply on create.',
        'The account is always created active. `active` on this body is ignored. Deactivate later with PUT.',
        '409 "That email is already in use". 400 "Agent name is required" if the name is blank after the schema (the schema already requires it).',
        'Side effects: none beyond the new user. They can sign in immediately. Stats on the response are zeros.',
        WIDE,
      ].join('\n\n'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', maxLength: 120 },
            email: { type: 'string', maxLength: 200 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            phone: { type: 'string' },
            roles: jobTitleSchema,
            staffRoles: staffRoleIdsSchema,
            permissions: permissionListSchema,
            manager: { ...oid, nullable: true },
          },
        }, example: { name: 'Meera Joshi', email: 'meera@example.com', password: 'Survey1pass', phone: '9988776655', roles: ['Site surveyor'], staffRoles: ['665f1c2a3b4d5e6f7a8b9c20'], permissions: [], manager: null } } },
      },
      success: { 201: json('The new staff account.', staffRecord, staffExample) },
      extra: { 400: ref('ValidationError'), 409: ref('Conflict') },
    }),
  },

  '/api/agents/analytics': {
    get: op({
      tag: 'Staff',
      operationId: 'staffAnalytics',
      summary: 'Team workload for the owner overview',
      description: [
        'Who: branch owner or company admin only.',
        'Headline numbers for the whole branch: open installation steps, a 30-day completion trend (Asia/Kolkata dates, zeros included, oldest first), open work by job-title role, and how far installations have got. `avgStepHours` is the mean hours from startedAt to completedAt for steps finished in the last 90 days that have a start time, rounded to 1 decimal, or null when there are none.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Team analytics.', {
          type: 'object',
          properties: {
            team: { type: 'object', properties: { agents: { type: 'integer' }, activeAgents: { type: 'integer' } } },
            totals: { type: 'object', properties: { open: { type: 'integer' }, pending: { type: 'integer' }, inProgress: { type: 'integer' }, done7: { type: 'integer' }, done30: { type: 'integer' }, done90: { type: 'integer' }, doneTotal: { type: 'integer' }, unassignedOpen: { type: 'integer', description: 'Open steps on active installations with no assignee.' } } },
            avgStepHours: nullableNum,
            trend: { type: 'array', items: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD in Asia/Kolkata.' }, count: { type: 'integer' } } } },
            byRole: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', description: 'Job title, or "No role set".' }, pending: { type: 'integer' }, inProgress: { type: 'integer' }, open: { type: 'integer' } } } },
            installations: { type: 'object', properties: { active: { type: 'integer' }, completed: { type: 'integer' }, stepsDone: { type: 'integer' }, stepsTotal: { type: 'integer' } } },
            agents: { type: 'array', description: 'Sorted by name.', items: { type: 'object', properties: { id: oid, name: { type: 'string' }, photo: { type: 'string' }, active: { type: 'boolean' }, roles: { type: 'array', items: { type: 'string' } }, pending: { type: 'integer' }, inProgress: { type: 'integer' }, open: { type: 'integer' }, done7: { type: 'integer' }, done30: { type: 'integer' }, done90: { type: 'integer' }, doneTotal: { type: 'integer' } } } },
          },
        }),
      },
    }),
  },

  '/api/agents/{id}': {
    put: op({
      tag: 'Staff',
      operationId: 'staffUpdate',
      summary: 'Update a staff account',
      description: [
        'Who: branch owner or company admin only.',
        'Partial. Omit a key to leave it unchanged. Sending `roles`, `staffRoles`, or `permissions` replaces that whole list (same rules and normalisation as create). Sending `password` as "" or omitting it does not change the password. A new password must be 8–200 characters with a letter and a number, bumps tokenVersion, and revokes every session.',
        '`active` is read by the service even though it is not in the zod object. Send a boolean. `false` blocks sign-in and revokes sessions. Any non-boolean is ignored.',
        '`manager`: a staff id, or null or "" to clear. 400 "A person cannot report to themselves". 400 "Choose a manager from this branch’s staff" when the id is not an active staff user in this branch.',
        '400 "Agent name is required" when `name` is sent blank. 409 "That email is already in use". 404 "Agent not found".',
        'The response includes current workload stats for this person.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Staff user id.')],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: {
          type: 'object',
          description: 'Every key is optional. Omit a key to leave it unchanged.',
          properties: {
            name: { type: 'string', maxLength: 120 },
            email: { type: 'string' },
            password: { type: 'string', description: 'Omit or "" to keep the current password.' },
            phone: { type: 'string' },
            roles: jobTitleSchema,
            staffRoles: staffRoleIdsSchema,
            permissions: permissionListSchema,
            manager: { ...oid, nullable: true },
            active: { type: 'boolean' },
          },
        }, example: { active: false } } },
      },
      success: { 200: json('The updated staff account.', staffRecord, { ...staffExample, active: false }) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 409: ref('Conflict') },
    }),
    delete: op({
      tag: 'Staff',
      operationId: 'staffDelete',
      summary: 'Delete a staff account',
      description: [
        'Who: branch owner or company admin only.',
        'Side effects: their installation steps become unassigned (assignee null). Activity logs keep the person\'s name. Their portrait file is deleted. The user row is deleted, which signs them out because the account is gone.',
        '404 "Agent not found".',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Staff user id.')],
      success: { 200: ok },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/agents/{id}/overview': {
    get: op({
      tag: 'Staff',
      operationId: 'staffOverview',
      summary: 'One staff member\'s work page',
      description: [
        'Who: branch owner or company admin only. The mount rejects staff before this handler runs.',
        'Profile plus installation steps, leads, AMC visits, expenses they recorded in the last 90 days, and a merged activity feed (latest 50).',
        'Leads: counts by status across Meta, Google Ads, and manual leads currently assigned to them, the latest 50 of those, plus leads they held and then handed on (up to 50 per source). `source` on a lead row is one of "Facebook / Instagram", "Google Ads", "Imported", "Added by your team".',
        '404 "Staff member not found".',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Staff user id.')],
      success: {
        200: json('The staff page.', {
          type: 'object',
          properties: {
            profile: { type: 'object', properties: { id: oid, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, photo: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } }, staffRoles: { type: 'array', items: { type: 'object', properties: { id: oid, name: { type: 'string' } } } }, active: { type: 'boolean' }, createdAt: nullableDate, lastLoginAt: nullableDate } },
            tasks: { type: 'object', properties: {
              open: { type: 'integer' }, inProgress: { type: 'integer' }, pending: { type: 'integer' }, stuck: { type: 'integer' }, done7: { type: 'integer' }, done30: { type: 'integer' }, doneTotal: { type: 'integer' }, avgHours: nullableNum, jobs: { type: 'integer', description: 'Distinct installations among open steps.' },
              monthly: { type: 'array', description: 'Last 6 calendar months, oldest first.', items: { type: 'object', properties: { key: { type: 'string', example: '2026-04' }, label: { type: 'string', example: 'Apr 2026' }, done: { type: 'integer' } } } },
              openList: { type: 'array', items: { type: 'object', properties: { projectId: oid, project: { type: 'string' }, client: { type: 'string' }, address: { type: 'string' }, projectStatus: { type: 'string', enum: ['active', 'completed'] }, step: { type: 'string' }, role: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] }, startedAt: nullableDate, completedAt: nullableDate, stuck: { type: 'boolean' } } } },
              doneList: { type: 'array', description: 'Latest 50 completed steps.', items: { type: 'object' } },
            } },
            leads: { type: 'object', properties: {
              total: { type: 'integer' }, notStarted: { type: 'integer' }, converted: { type: 'integer' }, handedOverCount: { type: 'integer' },
              byStatus: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', description: 'Status id, or "none" for Not started.' }, name: { type: 'string' }, color: { type: 'string', enum: ['slate', 'blue', 'amber', 'emerald', 'rose', 'purple', 'cyan'] }, outcome: { type: 'string', enum: ['open', 'converted', 'lost'] }, count: { type: 'integer' } } } },
              recent: { type: 'array', items: { type: 'object', properties: { id: oid, name: { type: 'string' }, phone: { type: 'string' }, source: { type: 'string' }, at: dateTime, status: { nullable: true, type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' } } } } } },
              handedOver: { type: 'array', items: { type: 'object', properties: { id: oid, name: { type: 'string' }, phone: { type: 'string' }, source: { type: 'string' }, at: dateTime, status: { nullable: true }, handedOver: { type: 'boolean', enum: [true] }, nowWith: { type: 'string' }, heldFrom: nullableDate, heldUntil: nullableDate } } },
              log: { type: 'array', description: 'Also merged into activity.', items: { type: 'object', properties: { phase: { type: 'string', enum: ['lead'] }, at: dateTime, action: { type: 'string' }, byName: { type: 'string' }, message: { type: 'string' }, where: { type: 'string' }, leadId: oid } } },
            } },
            visits: { type: 'object', properties: {
              open: { type: 'integer' }, late: { type: 'integer', description: 'Booked open visits with daysLeft < 0.' }, today: { type: 'integer', description: 'Booked open visits with daysLeft 0.' }, done: { type: 'integer' },
              openList: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, projectId: { ...oid, nullable: true }, name: { type: 'string' }, client: { type: 'string' }, address: { type: 'string' }, daysLeft: { type: 'integer', nullable: true }, dueDate: nullableDate, booked: { type: 'boolean' } } } },
            } },
            expenses: { type: 'object', properties: { count: { type: 'integer' }, total: { type: 'number' }, recent: { type: 'array', items: { type: 'object', properties: { id: oid, amount: { type: 'number' }, reason: { type: 'string' }, spentOn: dateTime, design: { nullable: true, type: 'object', properties: { id: oid, name: { type: 'string' } } } } } } } },
            activity: { type: 'array', description: 'Latest 50 lines from installations, proposals, and leads, newest first.', items: { type: 'object', properties: {
              phase: { type: 'string', enum: ['installation', 'design', 'lead'] },
              byName: { type: 'string', description: 'Empty when this staff member wrote the line.' },
              at: dateTime, action: { type: 'string' }, stepName: { type: 'string' }, message: { type: 'string' }, where: { type: 'string' },
              href: { type: 'string', description: 'App path for installation and lead lines.' },
              design: { type: 'object', description: 'Present on design lines.', properties: { id: oid, type: { type: 'string', enum: ['3d', 'quick'] }, summary: { type: 'object', properties: { panels: { type: 'number' } } } } },
              leadId: oid,
            } } },
          },
        }),
      },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/agents/{id}/photo': {
    post: op({
      tag: 'Staff',
      operationId: 'staffUploadPhoto',
      summary: 'Set a staff portrait',
      description: [
        'Who: branch owner or company admin only.',
        'Multipart field name `file`. One image. PNG, JPG, or WebP. At most 2 MB. Wrong type: "Upload a PNG, JPG or WebP image". Bad bytes: "That file is not a valid PNG, JPG or WebP image". Too large: "That file is too large". No file: 400 "Choose an image to upload".',
        'Replaces the previous portrait file. The response is the same object as one row of GET /api/agents (with current stats), not only the photo path.',
        UPLOAD_LIMIT,
      ].join('\n\n'),
      parameters: [idParam('Staff user id.')],
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'PNG, JPG, or WebP. Max 2 MB.' } } }, encoding: { file: { contentType: 'image/png, image/jpeg, image/webp' } } } },
      },
      success: { 200: json('The staff list row after the photo is saved.', staffRecord) },
      extra: { 400: err('No image or a file that is not a PNG, JPG, or WebP.', { error: 'Choose an image to upload' }), 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
    delete: op({
      tag: 'Staff',
      operationId: 'staffDeletePhoto',
      summary: 'Remove a staff portrait',
      description: [
        'Who: branch owner or company admin only.',
        'Deletes the stored file and sets `photo` to "". If they had no photo, the account is unchanged. Returns the staff list row.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Staff user id.')],
      success: { 200: json('The staff list row with photo "".', staffRecord, { ...staffExample, photo: '' }) },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/roles/catalog': {
    get: op({
      tag: 'Roles',
      operationId: 'roleCatalog',
      summary: 'Permission catalog and role templates',
      description: [
        'Who: branch owner or company admin only (`companyOnly`). Staff cannot open the role editor.',
        'Build the role and staff permission UI from this response. Do not hard-code a second copy: `areas` is every grantable permission, `templates` are starting points whose `permissions` are already normalised.',
        'A permission id the form submits is `areaId:actionId`, for example `clients:view`.',
        'Areas and actions (label in parentheses):',
        '- leads (Leads): view (Assigned to them), view_team (Their team), view_all (View all), create (Add & import), change_status (Change status), update (Edit & set priority), assign (Assign), export (Export)',
        '- proposals (Proposals): view (View), create (Create), update (Edit), change_status (Change status), change_client (Change client), share (Share link), delete (Delete)',
        '- clients (Clients): view (View), view_team (Their team’s clients), create (Create), update (Edit), manage_login (Portal login), delete (Delete)',
        '- finances (Finances): view (View), create_eway_bill (Create bill), create_bill (Create receipt), create_invoice (Create AMC parts invoice)',
        '- inventory (Inventory): view, create, update, delete',
        '- tasks (Installations): view (View all), view_team (Their team’s installations), create (Start), update (Edit steps), assign (Assign steps), change_status (Update step status), invoice_parts (Invoice parts used on AMC visits), delete (Delete)',
        '- support (Platform support): view (View), create (Create), update (Reply & close)',
        '- helpdesk (Client support): view (View), update (Reply & change status)',
        '- expenses (Expenses): view (View), create (Add expenses), update (Edit expenses), delete (Delete expenses)',
        '- loans (Loans): view (View), update (Update loan & steps)',
        '- subsidies (Subsidies): view (View), update (Update subsidy & steps)',
        'Templates (key, name): telecaller Telecaller, lead_manager Lead manager, sales Sales executive, designer Designer, accountant Accountant, cashier Cashier, invoicing Invoicing clerk, storekeeper Store keeper, area_manager Area manager, supervisor Installation supervisor. Copy `templates[].permissions` into a new role; they already include implied view. For area_manager, clients and tasks stay at view_team and do not include view.',
        'Nothing here is owner-only setup (company profile, masters, integrations). Those cannot be granted.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Catalog for the role editor.', {
          type: 'object',
          required: ['areas', 'templates'],
          properties: {
            areas: { type: 'array', items: { type: 'object', required: ['id', 'label', 'description', 'actions'], properties: {
              id: { type: 'string', enum: ['leads', 'proposals', 'clients', 'finances', 'inventory', 'tasks', 'support', 'helpdesk', 'expenses', 'loans', 'subsidies'] },
              label: { type: 'string' },
              description: { type: 'string' },
              actions: { type: 'array', items: { type: 'object', required: ['id', 'label'], properties: { id: { type: 'string' }, label: { type: 'string' } } } },
            } } },
            templates: { type: 'array', items: { type: 'object', required: ['key', 'name', 'description', 'permissions'], properties: {
              key: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              permissions: { type: 'array', items: { type: 'string', enum: PERMISSIONS } },
            } } },
          },
        }, {
          areas: [{ id: 'clients', label: 'Clients', description: 'Client records', actions: [{ id: 'view', label: 'View' }, { id: 'view_team', label: 'Their team’s clients' }, { id: 'create', label: 'Create' }, { id: 'update', label: 'Edit' }, { id: 'manage_login', label: 'Portal login' }, { id: 'delete', label: 'Delete' }] }],
          templates: [{ key: 'telecaller', name: 'Telecaller', description: 'Calls the leads assigned to them and updates their status — can’t assign or export.', permissions: ['leads:change_status', 'leads:view'] }],
        }),
      },
    }),
  },

  '/api/roles': {
    get: op({
      tag: 'Roles',
      operationId: 'roleList',
      summary: 'List permission roles',
      description: [
        'Who: branch owner or company admin only.',
        'Named permission sets for this branch, sorted by name (case-insensitive). `usedBy` is how many staff accounts include that role. Not paginated. At most 50 roles can exist.',
        WIDE,
      ].join('\n\n'),
      success: { 200: json('The company\'s roles.', { type: 'array', items: roleRecord }, [{ id: '665f1c2a3b4d5e6f7a8b9c20', company: '665f1c2a3b4d5e6f7a8b9c01', name: 'Sales executive', description: 'Works with clients and prepares proposals.', permissions: ['clients:create', 'clients:update', 'clients:view', 'inventory:view', 'leads:change_status', 'leads:view', 'proposals:change_status', 'proposals:create', 'proposals:share', 'proposals:update', 'proposals:view'], permissionsVersion: 6, usedBy: 3, createdAt: '2026-04-01T08:00:00.000Z', updatedAt: '2026-04-01T08:00:00.000Z' }]) },
    }),
    post: op({
      tag: 'Roles',
      operationId: 'roleCreate',
      summary: 'Create a permission role',
      description: [
        'Who: branch owner or company admin only.',
        '`name` required, at most 60 characters, internal whitespace collapsed. "Role name is required", "Role name can be at most 60 characters". The service also says "Give the role a name" and "Role names can be up to 60 characters" if a blank name reaches it.',
        '`description` optional, at most 200 characters. "Description can be at most 200 characters".',
        '`permissions` required (send [] for a role that grants nothing). Same normalisation as staff: implied view, except clients and tasks when view_team is included; view_all adds view_team; sorted. Show the returned list.',
        '400 "You can have up to 50 roles". 409 "A role with this name already exists" (case-insensitive).',
        'The new role applies only after it is added to a staff account (`staffRoles`).',
        WIDE,
      ].join('\n\n'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['name', 'permissions'], properties: { name: { type: 'string', maxLength: 60 }, description: { type: 'string', maxLength: 200 }, permissions: permissionListSchema } }, example: { name: 'Telecaller', description: 'Calls assigned leads.', permissions: ['leads:view', 'leads:change_status'] } } },
      },
      success: { 201: json('The role. usedBy is 0. permissions are the normalised list.', roleRecord, { id: '665f1c2a3b4d5e6f7a8b9c21', company: '665f1c2a3b4d5e6f7a8b9c01', name: 'Telecaller', description: 'Calls assigned leads.', permissions: ['leads:change_status', 'leads:view'], permissionsVersion: 6, usedBy: 0, createdAt: '2026-04-02T09:00:00.000Z', updatedAt: '2026-04-02T09:00:00.000Z' }) },
      extra: { 400: ref('ValidationError'), 409: ref('Conflict') },
    }),
  },

  '/api/roles/{id}': {
    put: op({
      tag: 'Roles',
      operationId: 'roleUpdate',
      summary: 'Update a permission role',
      description: [
        'Who: branch owner or company admin only.',
        'Partial. Omit a key to leave it unchanged. Sending `permissions` replaces the whole list (normalised). Sending `name` checks uniqueness except against this role.',
        'Side effect: everyone with this role picks up the new permissions on their next request. No need to edit each person. `usedBy` on the response is the current count.',
        '409 "A role with this name already exists". 404 "Role not found".',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Role id.')],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', description: 'Every key is optional.', properties: { name: { type: 'string', maxLength: 60 }, description: { type: 'string', maxLength: 200 }, permissions: permissionListSchema } }, example: { description: 'Calls assigned leads and updates status.' } } },
      },
      success: { 200: json('The updated role.', roleRecord) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 409: ref('Conflict') },
    }),
    delete: op({
      tag: 'Roles',
      operationId: 'roleDelete',
      summary: 'Delete a permission role',
      description: [
        'Who: branch owner or company admin only.',
        'Refused while any staff account still has it: 400 "1 staff member has this role. Remove it from them first." or "N staff members have this role. Remove it from them first." Take it off them with PUT /api/agents/{id} (`staffRoles`) first.',
        '404 "Role not found".',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Role id.')],
      success: { 200: ok },
      extra: { 400: err('The role is still assigned.', { error: '2 staff members have this role. Remove it from them first.' }), 404: ref('NotFound') },
    }),
  },

'/api/portal/me': {
    get: op({
      tag: 'Portal',
      operationId: 'portalMe',
      summary: 'The signed-in client\'s profile',
      description: [
        'Who: `role: client` only (`clientOnly`). Any other role: 403 "You do not have access to this area".',
        'The client record this login belongs to: name, email, phone, address, and PAN. No proposals and no company id. Timestamps are not selected.',
        '404 "Client not found" when the client row is gone.',
        WIDE,
      ].join('\n\n'),
      success: { 200: json('The client profile.', portalClient, { id: '665f1c2a3b4d5e6f7a8b9c0d', name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9876543210', address: '12 MG Road, Pune', pan: 'ABCPK1234F' }) },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/portal/proposals': {
    get: op({
      tag: 'Portal',
      operationId: 'portalListProposals',
      summary: 'The client\'s proposals',
      description: [
        'Who: `role: client` only.',
        'Every proposal for this client except drafts, newest update first. Not paginated. Each row adds `paid` (sum of payments on that proposal), `balance` (`total - paid` when status is won, otherwise null), and `amcPackages` (null when the company has no AMC templates).',
        '`canRespond` is true only for proposed, reproposed, or negotiation with no decision yet.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Proposal cards.', { type: 'array', items: { allOf: [portalProposal, { type: 'object', properties: { paid: { type: 'number' }, balance: { type: 'number', nullable: true }, amcPackages: { allOf: [amcPackages], nullable: true } } }] } }, [{
          id: '665f1c2a3b4d5e6f7a8b9c30', name: 'Rooftop 5 kW', type: '3d', status: 'proposed', updatedAt: '2026-04-10T12:00:00.000Z', createdAt: '2026-04-01T10:00:00.000Z',
          summary: { address: '12 MG Road, Pune', kwp: 5, panels: 10, annualKwh: 7500, cost: 280000 }, total: 280000, subsidy: { enabled: true, central: 78000, state: 0 }, clientResponse: null, reviewInvite: null, canRespond: true, paid: 0, balance: null, amcPackages: null,
        }]),
      },
    }),
  },

  '/api/portal/proposals/{id}': {
    get: op({
      tag: 'Portal',
      operationId: 'portalGetProposal',
      summary: 'One proposal, with money and AMC',
      description: [
        'Who: `role: client` only. The proposal must belong to this client and must not be a draft.',
        '404 "Proposal not found" for a bad id, a draft, another client\'s proposal, or another company.',
        '`pricing` on `proposal` is the stored breakdown or null. `total` uses `pricing.total` when that is a number, otherwise `summary.cost`.',
        '`payments` are every payment row on this proposal, oldest first. `bills` exclude void bills. `invoice` is the latest non-void sales invoice, or null (AMC-parts invoices are not returned here).',
        '`amc.visits` are the installation\'s maintenance visits when an installation exists, otherwise an empty list. `amcPackages` is always the object (check `hasCatalog`).',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Proposal id.')],
      success: { 200: json('Proposal detail for the client.', portalProposalDetail) },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/portal/proposals/{id}/response': {
    post: op({
      tag: 'Portal',
      operationId: 'portalRespondToProposal',
      summary: 'Accept, reject, or request changes',
      description: [
        'Who: `role: client` only.',
        'Allowed only while status is proposed, reproposed, or negotiation, and only once.',
        'Side effects: stores the decision, note, and time, and clears the review invite. `accepted` sets status to won. `rejected` sets status to lost. `changes_requested` leaves the status as it is. The company is notified. The response is the same object as GET /api/portal/proposals/{id}.',
        '400 "This proposal is not open for a response right now." when it is won, lost, or not this client\'s open proposal.',
        '400 "You have already responded to this proposal. Contact your provider if you need to change your answer."',
        'Field errors: "Choose accept, reject, or request changes". "Note is required". "Note can be at most 2000 characters".',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Proposal id.')],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['decision', 'note'], properties: {
          decision: { type: 'string', enum: ['accepted', 'rejected', 'changes_requested'] },
          note: { type: 'string', minLength: 1, maxLength: 2000 },
        } }, example: { decision: 'accepted', note: 'Please go ahead with this design.' } } },
      },
      success: { 200: json('The proposal after the decision, same shape as GET.', portalProposalDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound') },
    }),
  },

  '/api/portal/proposals/{id}/amc-requests': {
    post: op({
      tag: 'Portal',
      operationId: 'portalSubmitAmcRequest',
      summary: 'Request an optional AMC visit, or change its date',
      description: [
        'Who: `role: client` only.',
        'Books an optional AMC package on a preferred date, or changes the date of one of the client\'s own bookings when `requestId` is set. Mandatory packages cannot be requested. Allowed when the proposal is proposed, reproposed, negotiation, or won.',
        'Omit `requestId` or send "" to create a new request. The client can request the same package again. Send a booking id to change that booking\'s date and note. A date change on an assigned booking keeps the assignee. Any other status goes back to requested and the assignee is cleared.',
        'Side effects: saved on the proposal. If an installation exists, the visit is mirrored onto it. A new unassigned request notifies the company. Returns the proposal detail (same as GET).',
        '`requestedDate` is any string `Date` can parse; send YYYY-MM-DD. It is stored as the start of that day in the server\'s local time. "Choose a preferred date" when blank. "Choose a valid date" when it does not parse. "Choose today or a future date for the visit" when it is before today.',
        '400 "AMC requests cannot be changed for this proposal." on a lost proposal.',
        '400 "“<name>” is not an AMC package on your provider\'s schedule".',
        '400 "“<name>” is part of your maintenance plan — your provider schedules it, there is nothing to request".',
        '404 "AMC booking not found" when requestId is not on this proposal and package. 400 "This booking was cancelled". 400 "This visit was scheduled by your provider. Contact them to change it." 400 "This AMC visit is already completed".',
        'Note: "Note can be at most 500 characters". Package: "Package is required", "Package can be at most 80 characters".',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Proposal id.')],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['packageName', 'requestedDate'], properties: {
          packageName: { type: 'string', maxLength: 80, description: 'Exact name of an optional package from amcPackages.services.' },
          requestedDate: { type: 'string', description: 'Preferred day, YYYY-MM-DD.', example: '2026-05-12' },
          note: { type: 'string', maxLength: 500 },
          requestId: { type: 'string', description: 'Omit or "" to create. A booking id to change that booking instead.' },
        } }, example: { packageName: 'Panel cleaning', requestedDate: '2026-05-12', note: 'Morning please' } } },
      },
      success: { 200: json('The proposal detail after the booking is saved.', portalProposalDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound') },
    }),
  },

  '/api/portal/proposals/{id}/design': {
    get: op({
      tag: 'Portal',
      operationId: 'portalGetDesign',
      summary: '3D layout for the viewer',
      description: [
        'Who: `role: client` only. Drafts are not returned.',
        '`data` is the designer document as it was saved. This API only checks that `data.sections` is a non-empty array. It does not reshape sections, roofs, or objects. Quick proposals, and 3D proposals with no sections, are 400 "This proposal has no 3D design".',
        '404 "Proposal not found". Prices are not in this response. Load panel sizes from GET /api/portal/catalog.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Proposal id.')],
      success: {
        200: json('What the viewer needs to draw the saved layout.', {
          type: 'object',
          required: ['id', 'name', 'status', 'data', 'summary', 'client'],
          properties: {
            id: oid,
            name: { type: 'string' },
            status: { type: 'string', enum: ['proposed', 'reproposed', 'negotiation', 'won', 'lost'] },
            data: { type: 'object', required: ['sections'], description: 'Stored designer state. sections is a non-empty array. Every other key is returned as saved.', properties: { sections: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: true } } }, additionalProperties: true },
            summary: { type: 'object', properties: { address: { type: 'string' }, kwp: { type: 'number' }, panels: { type: 'number' }, annualKwh: { type: 'number' } } },
            client: { type: 'object', properties: { id: oid, name: { type: 'string' }, address: { type: 'string' } } },
          },
        }),
      },
      extra: { 400: err('This proposal has no drawable layout.', { error: 'This proposal has no 3D design' }), 404: ref('NotFound') },
    }),
  },

  '/api/portal/loans': {
    get: op({
      tag: 'Portal',
      operationId: 'portalListLoans',
      summary: 'The client\'s loans',
      description: [
        'Who: `role: client` only.',
        'Loans on this client\'s proposals, newest first. Not paginated. A loan whose proposal was deleted is omitted. Loans on draft proposals are included, with `proposal.shared` false, because the portal does not open drafts.',
        'Notes, the activity log, and step documents are not returned. Bank branch, IFSC, interest, tenure, EMI, and dates are not returned either. Step `remark` is the text to show.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Loans the client can see.', { type: 'array', items: { type: 'object', properties: {
          id: oid,
          proposal: { type: 'object', properties: { id: oid, name: { type: 'string' }, shared: { type: 'boolean', description: 'false when the proposal is still a draft.' } } },
          status: { type: 'string', enum: ['in_progress', 'completed', 'rejected'] },
          lender: { type: 'string' },
          amount: nullableNum,
          steps: { type: 'array', items: loanStep },
          createdAt: dateTime,
          updatedAt: dateTime,
        } } }, [{ id: '665f1c2a3b4d5e6f7a8b9c40', proposal: { id: '665f1c2a3b4d5e6f7a8b9c30', name: 'Rooftop 5 kW', shared: true }, status: 'in_progress', lender: 'State Bank', amount: 200000, steps: [{ id: '665f1c2a3b4d5e6f7a8b9c41', name: 'Application', description: '', status: 'done', remark: 'Filed', completedAt: '2026-04-05T00:00:00.000Z' }], createdAt: '2026-04-02T00:00:00.000Z', updatedAt: '2026-04-05T00:00:00.000Z' }]),
      },
    }),
  },

  '/api/portal/subsidies': {
    get: op({
      tag: 'Portal',
      operationId: 'portalListSubsidies',
      summary: 'The client\'s subsidies',
      description: [
        'Who: `role: client` only.',
        'Same visibility as loans: drafts are included with `proposal.shared` false; a missing proposal drops the row. Notes, logs, and step documents are not returned. Consumer number, discom, and the approved/credited dates are not returned.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Subsidies the client can see.', { type: 'array', items: { type: 'object', properties: {
          id: oid,
          proposal: { type: 'object', properties: { id: oid, name: { type: 'string' }, shared: { type: 'boolean' } } },
          status: { type: 'string', enum: ['in_progress', 'completed', 'rejected'] },
          scheme: { type: 'string' },
          applicationNo: { type: 'string' },
          centralAmount: nullableNum,
          stateAmount: nullableNum,
          receivedAmount: nullableNum,
          steps: { type: 'array', items: loanStep },
          createdAt: dateTime,
          updatedAt: dateTime,
        } } }),
      },
    }),
  },

  '/api/portal/catalog': {
    get: op({
      tag: 'Portal',
      operationId: 'portalCatalog',
      summary: 'Panel and pole sizes for the viewer',
      description: [
        'Who: `role: client` only.',
        'Sizes the 3D viewer needs. Prices are forced to 0. Packages, other products, and material categories are always empty. `otherCostPerKw` is always 0. `currency` and `tariff` (rupees per kWh, company default 8) come from the company.',
        'Only panels with watts, length, and width above 0 are included. Poles are every pole product.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Viewer catalog with prices removed.', {
          type: 'object',
          required: ['currency', 'tariff', 'otherCostPerKw', 'panels', 'pillars', 'packages', 'materialCategories'],
          properties: {
            currency: { type: 'string', example: 'INR' },
            tariff: { type: 'number' },
            otherCostPerKw: { type: 'number', enum: [0] },
            panels: { type: 'array', items: viewerPanel },
            pillars: { type: 'array', items: viewerPillar },
            packages: { type: 'array', maxItems: 0, items: { type: 'object' } },
            materialCategories: { type: 'array', maxItems: 0, items: { type: 'object' } },
          },
        }, { currency: 'INR', tariff: 8, otherCostPerKw: 0, panels: [{ id: '665f1c2a3b4d5e6f7a8b9c50', brand: 'Waaree', model: '540', watts: 540, length: 1.9, width: 1.05, warrantyMonths: 144, hsnCode: '85414300', gstPercent: 12, attributes: {}, price: 0, manufactureYear: 2025, warrantyYears: 12, categoryName: 'Panels', parentId: '', parentName: '', parentOrder: 0 }], pillars: [], packages: [], materialCategories: [] }),
      },
    }),
  },

  '/api/portal/referrals/form': {
    get: op({
      tag: 'Portal',
      operationId: 'portalReferralForm',
      summary: 'The company\'s lead form for a referral',
      description: [
        'Who: `role: client` only.',
        'The same form staff use to add a lead. The first three fields are always name (text, required), phone (phone, required), and address (textarea, optional), with `fixed: true`. The company\'s own fields follow, in the company\'s order. Build the form from `fields`. Do not assume extra keys.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Form fields.', { type: 'object', required: ['fields'], properties: { fields: { type: 'array', items: leadField } } }, { fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, fixed: true },
          { key: 'phone', label: 'Phone', type: 'phone', required: true, fixed: true },
          { key: 'address', label: 'Address', type: 'textarea', required: false, fixed: true },
        ] }),
      },
    }),
  },

  '/api/portal/referrals': {
    get: op({
      tag: 'Portal',
      operationId: 'portalListReferrals',
      summary: 'People this client referred',
      description: [
        'Who: `role: client` only.',
        'Newest first, at most 200. The client sees who, when, and only an outcome: open (still in progress), converted, or lost. Nothing else about the lead is returned. `outcomeAt` is null while outcome is open.',
        WIDE,
      ].join('\n\n'),
      success: {
        200: json('Referrals.', { type: 'array', items: { type: 'object', properties: {
          id: oid, name: { type: 'string' }, phone: { type: 'string' }, createdAt: dateTime, outcome: { type: 'string', enum: ['open', 'converted', 'lost'] }, outcomeAt: nullableDate,
        } } }, [{ id: '665f1c2a3b4d5e6f7a8b9c60', name: 'Suresh Patil', phone: '9811111111', createdAt: '2026-04-08T06:00:00.000Z', outcome: 'open', outcomeAt: null }]),
      },
    }),
    post: op({
      tag: 'Portal',
      operationId: 'portalCreateReferral',
      summary: 'Refer someone to the company',
      description: [
        'Who: `role: client` only.',
        'Body keys are the form field `key`s from GET /api/portal/referrals/form, plus an optional `note` for the company (cut to 300 characters, not rejected, and not returned). Unknown keys are ignored. There is no fixed zod schema: the company\'s form is checked in the service.',
        'Field rules: text up to 200 characters (name up to 120), textarea up to 2000, number must be numeric, phone must match a loose phone pattern, email must look like an email and is stored lower case, select must be one of the options (case-insensitive), multiselect is an array or a comma/semicolon-separated string of options, date accepts YYYY-MM-DD or D/M/YYYY or D-M-YYYY, yesno accepts yes/no, true/false, 1/0, or a boolean. A required empty field: "<label> is required".',
        'This 400 is not the usual validation body. There is no `code`. `details.errors` maps each field key to its message, and `error` is the first message. Example: `{ "error": "Name is required", "details": { "errors": { "name": "Name is required" } } }`. A phone that passes the form but has fewer than 7 digits: "Enter their mobile number" on `details.errors.phone`.',
        '409 "You have already referred this person." when this client already referred that phone. 409 "Thank you! We already have this person’s details." when the company already has that phone from someone else.',
        'Side effects: creates a manual lead with source referral, records who referred them, and notifies the company. The client later only learns converted or lost.',
        'Rate limit: 20 referrals per signed-in client per hour. 429 "Too many requests. Try again in N seconds." code RATE_LIMITED. Also the API-wide 1500 per IP per 5 minutes.',
      ].join('\n\n'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: {
          type: 'object',
          description: 'One property per form field key, plus optional note. Additional keys that are not on the form are ignored.',
          properties: {
            name: { type: 'string', maxLength: 120 },
            phone: { type: 'string' },
            address: { type: 'string', maxLength: 2000 },
            note: { type: 'string', description: 'Optional message for the company. Stored up to 300 characters.' },
          },
          additionalProperties: true,
        }, example: { name: 'Suresh Patil', phone: '9811111111', address: 'Kothrud, Pune', note: 'Neighbour, asked about a 3 kW system' } } },
      },
      success: {
        200: json('The new referral, in the same shape as one list row. This route returns 200, not 201.', { type: 'object', properties: {
          id: oid, name: { type: 'string' }, phone: { type: 'string' }, createdAt: dateTime, outcome: { type: 'string', enum: ['open'] }, outcomeAt: { nullable: true },
        } }, { id: '665f1c2a3b4d5e6f7a8b9c60', name: 'Suresh Patil', phone: '9811111111', createdAt: '2026-04-08T06:00:00.000Z', outcome: 'open', outcomeAt: null }),
      },
      extra: {
        400: err('The form rejected a field. details.errors is keyed by field key. There is no code VALIDATION.', { error: 'Name is required', details: { errors: { name: 'Name is required' } } }),
        409: ref('Conflict'),
        429: ref('RateLimited'),
      },
    }),
  },

  '/api/portal/tickets': {
    get: op({
      tag: 'Portal',
      operationId: 'portalListTickets',
      summary: 'This client\'s help requests to their solar company',
      description: [
        'Who: `role: client` only. This is not GET /api/tickets (company ↔ Innovbit, refs TKT-) and not GET /api/client-tickets (the company\'s inbox of the same REQ- requests). This list is only the signed-in client\'s own REQ- requests.',
        'Newest message first. `messages` is only the latest message, for a preview. `messageCount` is the full count. `logs` are omitted. `unread` is how many company replies this client has not opened. Opening the detail clears it; this list does not.',
        '`client` is `{ id, name, phone }`. `createdBy` is `{ id, name, email, role }`. `company` is the branch id, not a populated object. `ref` is REQ- plus the last 6 hex characters of id, upper case.',
        'Query `status` filters only when it is open, in_progress, resolved, or closed. Anything else is ignored. `q` matches the subject, REQ- plus the code, the last 6 hex characters, or the full id. `client` is ignored here (a client cannot list someone else). `unread=1` or `unread=true` returns only requests with unread replies.',
        '404 "Request not found" is not used on the list. A client login with no client id: 403 "You do not have access to this area".',
        WIDE,
      ].join('\n\n'),
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ticketStatusEnum }, description: 'Optional. Any other value is ignored, not a 400.' },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Subject or REQ code. First 100 characters are used.' },
        { name: 'unread', in: 'query', schema: { type: 'string', enum: ['1', 'true'] }, description: 'Pass 1 or true to keep only requests with unread company replies. Any other value does not filter.' },
        ...pageParams,
      ],
      success: {
        200: json('One page of this client\'s help requests.', {
          type: 'object',
          required: ['items', 'total', 'page', 'limit'],
          properties: {
            items: { type: 'array', items: { type: 'object', properties: {
              id: oid, ref: { type: 'string', example: 'REQ-9C0D1E' }, company: oid, client: { type: 'object', properties: { id: oid, name: { type: 'string' }, phone: { type: 'string' } } },
              createdBy: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } },
              subject: { type: 'string' }, category: { type: 'string', enum: clientCategoryEnum }, priority: { type: 'string', enum: ticketPriorityEnum }, status: { type: 'string', enum: ticketStatusEnum },
              messages: { type: 'array', maxItems: 1, items: ticketMessage }, unread: { type: 'integer' }, messageCount: { type: 'integer' }, lastMessageAt: dateTime, createdAt: dateTime, updatedAt: dateTime,
            } } },
            total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' },
          },
        }),
      },
    }),
    post: op({
      tag: 'Portal',
      operationId: 'portalCreateTicket',
      summary: 'Open a help request to the solar company',
      description: [
        'Who: `role: client` only. Do not send `clientId` (it is ignored; the request is filed on the signed-in client). The company starts a conversation from POST /api/client-tickets, which does require `clientId`.',
        'Needs a subject and either message text or a file. Category defaults to service when omitted or not one of installation, service, billing, proposal, other. Priority defaults to normal. Status starts at open.',
        'Side effects: the company\'s unread count goes to 1, the company is notified, and an audit line action `created` is stored. Returns the full request (same as GET), with unread 0 for the client because opening it marks their side read.',
        '400 "Describe what you need or attach a file" when there is no text and no file. Zod still rejects a short subject first: "Subject is required", "Subject must be at least 3 characters", "Subject can be at most 150 characters".',
        'Files: multipart field `files`, up to 5, each at most 10 MB, PNG, JPG, WebP, or PDF. "Attach a PNG, JPG, WebP image or a PDF". Bad bytes: "That file is not a valid PNG, JPG, WebP image or PDF". Too large: "That file is too large". JSON with no files is allowed when `body` is set.',
        'This write counts toward the upload limit even with no file: 60 per user per 10 minutes, and 3 uploads in progress. There is no separate portal-ticket window. ' + UPLOAD_LIMIT,
      ].join('\n\n'),
      requestBody: multipartTicket({
        type: 'object',
        required: ['subject'],
        properties: { ...ticketTextProps, category: { type: 'string', enum: clientCategoryEnum }, files: fileField },
      }, { subject: 'Inverter showing a fault', body: 'The inverter beeps every few minutes since yesterday.', category: 'service', priority: 'normal' }),
      success: { 201: json('The created request, full conversation. unread is 0 because the create response is loaded the same way as GET.', clientTicketDetail) },
      extra: { 400: ref('ValidationError'), 429: ref('RateLimited') },
    }),
  },

  '/api/portal/tickets/unread-count': {
    get: op({
      tag: 'Portal',
      operationId: 'portalTicketUnread',
      summary: 'Badge counts for the client\'s help requests',
      description: [
        'Who: `role: client` only.',
        '`unread` is how many of this client\'s requests have company replies they have not opened. `open` is how many are open or in_progress (resolved and closed are not counted). Does not mark anything read. Poll this, not the detail.',
        'A caller who cannot see requests gets `{ "unread": 0, "open": 0 }` rather than 403.',
        'This is not GET /api/tickets/unread-count, which returns only `{ unread }` for platform tickets.',
        WIDE,
      ].join('\n\n'),
      success: { 200: json('Badge numbers.', { type: 'object', required: ['unread', 'open'], properties: { unread: { type: 'integer' }, open: { type: 'integer' } } }, { unread: 1, open: 2 }) },
    }),
  },

  '/api/portal/tickets/{id}': {
    get: op({
      tag: 'Portal',
      operationId: 'portalGetTicket',
      summary: 'One help request, full thread',
      description: [
        'Who: `role: client` only. Only their own request. Another client\'s id is 404 "Request not found".',
        'Side effect: sets this client\'s unread count on the request to 0. Do not poll this URL for a badge.',
        'Includes every message and the audit log. `client` here is `{ id, name, phone, email }` (the list has no email). `ref` is REQ- plus the last 6 hex characters. `unread` in the body is 0 after this call when it was cleared.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Help request id.')],
      success: { 200: json('Full request. Opening it clears this client\'s unread count.', clientTicketDetail) },
      extra: { 404: ref('NotFound') },
    }),
  },

  '/api/portal/tickets/{id}/messages': {
    post: op({
      tag: 'Portal',
      operationId: 'portalTicketMessage',
      summary: 'Reply on a help request',
      description: [
        'Who: `role: client` only, on their own request.',
        'Needs text or a file. "Write a message or attach a file". "Message can be at most 4000 characters". At 1000 messages: 400 "This conversation is full. Open a new request."',
        'Side effects: appends the message, bumps the company\'s unread count, notifies the company. If the request was resolved or closed, it becomes open and the log records reopened. Returns the full request.',
        'Same file rules as create (`files`, 5 × 10 MB, PNG/JPG/WebP/PDF). Counts toward the upload limit even with no file. ' + UPLOAD_LIMIT,
      ].join('\n\n'),
      parameters: [idParam('Help request id.')],
      requestBody: multipartTicket({ type: 'object', properties: { body: ticketTextProps.body, files: fileField } }, { body: 'It beeped again this morning.' }),
      success: { 201: json('The full request after the reply.', clientTicketDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },

  '/api/portal/tickets/{id}/status': {
    put: op({
      tag: 'Portal',
      operationId: 'portalTicketStatus',
      summary: 'Close or reopen the client\'s own request',
      description: [
        'Who: `role: client` only.',
        'A client may set `closed`, or set `open` when the current status is resolved or closed. Anything else: 403 "You can close a request or reopen a resolved one". The company changes any status from PUT /api/client-tickets/{id}/status.',
        'Sending the status it already has returns the request and writes nothing. A real change notifies the company. Log action is `reopened` when moving from resolved or closed to open, otherwise `status_changed`.',
        'Body is JSON, not multipart. "Invalid ticket status" when status is missing or not one of open, in_progress, resolved, closed.',
        WIDE,
      ].join('\n\n'),
      parameters: [idParam('Help request id.')],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ticketStatusEnum } } }, example: { status: 'closed' } } } },
      success: { 200: json('The full request after the status change.', clientTicketDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound') },
    }),
  },

  '/api/tickets': {
    get: op({
      tag: 'Support tickets',
      operationId: 'ticketList',
      summary: 'Platform support inbox (company ↔ Innovbit)',
      description: [
        'Who: a company user with `support:view` (branch owner and company admin pass), or the platform admin (`role: superadmin`). Staff without `support:view`: 403 "You do not have access to this area". This route has no permissionOnly middleware; the service checks `support:view`.',
        'This list is the company talking to Innovbit. It is not GET /api/client-tickets and not GET /api/portal/tickets (those are REQ- conversations with the company\'s own clients).',
        'A company user sees only their branch. The platform admin sees every company. Newest message first. `messages` is the latest message only. `messageCount` is the full count. `logs` are omitted. `company` is `{ id, name, logo }`. `createdBy` is `{ id, name, email }`. `unread` is company-side unread for a company user, and admin-side unread for the platform admin.',
        'List items do not include `ref` (the query is lean). Build it as TKT- plus the last 6 hex characters of `id`, upper case. The detail includes `ref`.',
        '`status` filters only for open, in_progress, resolved, closed; other values are ignored. `q` matches the subject, a TKT- code, the last 6 hex characters, or the full id.',
        'Rate limit: 120 requests per signed-in user per 10 minutes on every /api/tickets route, including this list. 429 code RATE_LIMITED.',
      ].join('\n\n'),
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ticketStatusEnum }, description: 'Optional. Ignored when it is not one of the four statuses.' },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Subject or TKT code. First 100 characters.' },
        ...pageParams,
      ],
      success: {
        200: json('One page of platform tickets. ref is absent on these rows.', {
          type: 'object',
          required: ['items', 'total', 'page', 'limit'],
          properties: {
            items: { type: 'array', items: { type: 'object', properties: {
              ...platformTicketListFields,
              messages: { type: 'array', maxItems: 1, items: ticketMessage, description: 'Only the latest message. Use messageCount for the thread length.' },
              messageCount: { type: 'integer' },
            } } },
            total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' },
          },
        }),
      },
      extra: { 429: ref('RateLimited') },
    }),
    post: op({
      tag: 'Support tickets',
      operationId: 'ticketCreate',
      summary: 'Open a ticket with Innovbit',
      description: [
        'Who: `support:create`. Branch owner and company admin pass. The platform admin cannot open one: 403 "Only the company owner or a staff account with the support permission can open a ticket". Staff without create get that same 403.',
        'Needs a subject and text or a file. Category defaults to technical (technical, billing, account, other). Priority defaults to normal. Status starts open. The platform\'s unread count starts at 1.',
        '400 "Describe the problem or attach a file" when both text and files are missing. Subject errors are the zod messages ("Subject is required", "Subject must be at least 3 characters", "Subject can be at most 150 characters").',
        'Files: field `files`, up to 5, 10 MB each, PNG, JPG, WebP, or PDF. "Attach a PNG, JPG, WebP image or a PDF". Bad bytes: "That file is not a valid PNG, JPG, WebP image or PDF". Too large: "That file is too large".',
        'Returns the full ticket (same as GET), which marks the company side read, so `unread` is 0.',
        'Rate limit: 120 per user per 10 minutes for /api/tickets, and this write also counts as an upload (60 per 10 minutes, 3 in progress) even when the body is JSON with no file.',
      ].join('\n\n'),
      requestBody: multipartTicket({
        type: 'object',
        required: ['subject'],
        properties: { ...ticketTextProps, category: { type: 'string', enum: platformCategoryEnum }, files: fileField },
      }, { subject: 'Cannot download the invoice PDF', body: 'The download spins and then fails.', category: 'technical', priority: 'normal' }),
      success: { 201: json('The created ticket, full thread, including ref. unread is 0 for the company because the response is loaded like GET.', platformTicketDetail) },
      extra: { 400: ref('ValidationError'), 429: ref('RateLimited') },
    }),
  },

  '/api/tickets/unread-count': {
    get: op({
      tag: 'Support tickets',
      operationId: 'ticketUnread',
      summary: 'How many platform tickets have unread replies',
      description: [
        'Who: anyone signed in. Without `support:view`, and for anyone who is not the platform admin, the body is `{ "unread": 0 }` and not a 403. Company users count tickets where the company has not opened an admin reply. The platform admin counts tickets the admin has not opened.',
        'Does not mark anything read. Only `{ unread }`. There is no `open` count here; that field is on the client-help badge.',
        'Rate limit: 120 per user per 10 minutes.',
      ].join('\n\n'),
      success: { 200: json('Unread platform tickets.', { type: 'object', required: ['unread'], properties: { unread: { type: 'integer' } } }, { unread: 2 }) },
      extra: { 429: ref('RateLimited') },
    }),
  },

  '/api/tickets/{id}': {
    get: op({
      tag: 'Support tickets',
      operationId: 'ticketGet',
      summary: 'One platform ticket, full thread',
      description: [
        'Who: `support:view`, or the platform admin. Others: 403 "You do not have access to this area". A company user can only open their branch\'s ticket. Anyone else, or a bad id: 404 "Ticket not found".',
        'Side effect: sets the caller\'s unread counter to 0 (companyUnread for the company, adminUnread for the platform admin). Do not poll this for the badge.',
        '`company` is `{ id, name, logo, email, phone }`. `createdBy` is `{ id, name, email }`. `ref` is present (TKT- plus the last 6 hex characters). Messages and logs are complete.',
        'Rate limit: 120 per user per 10 minutes.',
      ].join('\n\n'),
      parameters: [idParam('Platform ticket id.')],
      success: { 200: json('Full platform ticket. Opening it clears the caller\'s unread counter.', platformTicketDetail) },
      extra: { 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },

  '/api/tickets/{id}/messages': {
    post: op({
      tag: 'Support tickets',
      operationId: 'ticketMessage',
      summary: 'Reply on a platform ticket',
      description: [
        'Who: `support:update`, or the platform admin. Without that: 403 "You do not have access to this area".',
        'Needs text or a file. "Write a message or attach a file". At 1000 messages: 400 "This conversation is full. Open a new ticket."',
        'The platform admin cannot reply when status is closed: 400 "This ticket is closed. The company must reopen it first." A company reply on resolved or closed sets status back to open (log action reopened). An admin reply while status is open sets it to in_progress and notifies the company. A company reply does not send that notification.',
        'Same `files` rules as create. Counts as an upload even with no file. Route limit 120 per user per 10 minutes as well.',
        'Returns the full ticket.',
      ].join('\n\n'),
      parameters: [idParam('Platform ticket id.')],
      requestBody: multipartTicket({ type: 'object', properties: { body: ticketTextProps.body, files: fileField } }, { body: 'Here is a screenshot of the error.' }),
      success: { 201: json('The full ticket after the reply.', platformTicketDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },

  '/api/tickets/{id}/status': {
    put: op({
      tag: 'Support tickets',
      operationId: 'ticketStatus',
      summary: 'Change a platform ticket\'s status',
      description: [
        'Who: `support:update`, or the platform admin. Without that: 403 "You do not have access to this area".',
        'The platform admin may set any of open, in_progress, resolved, closed. A company user may only set closed, or set open when the ticket is resolved or closed. Otherwise 403 "You can close a ticket or reopen a resolved one".',
        'The same status again returns the ticket and does not write a log. A real change by the platform admin notifies the company. Log message uses the labels Open, In progress, Resolved, Closed.',
        'JSON body. "Invalid ticket status" when status is not one of the four.',
        'Rate limit: 120 per user per 10 minutes.',
      ].join('\n\n'),
      parameters: [idParam('Platform ticket id.')],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ticketStatusEnum, description: 'Company users may send closed, or open to reopen. The platform admin may send any of the four.' } } }, example: { status: 'closed' } } } },
      success: { 200: json('The full ticket after the status change.', platformTicketDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },

  '/api/client-tickets': {
    get: op({
      tag: 'Client tickets',
      operationId: 'clientTicketList',
      summary: 'Company inbox of client help requests',
      description: [
        'Who: branch owner, company admin, or staff with `helpdesk:view`. Mount: any Client support permission, or 403 "You don\'t have access to Client support. Ask your company admin." This route: 403 "You need the “Client support › View” permission. Ask your company admin."',
        'This is the company\'s side of REQ- requests with its own clients. The client\'s side of the same records is GET /api/portal/tickets. Innovbit platform tickets are GET /api/tickets (TKT-). Do not render those lists on this screen.',
        'Every client in the branch, newest message first. `client` is `{ id, name, phone }`. `createdBy` includes `role`. `company` is the branch id. `ref` is on each row (REQ- plus the last 6 hex characters). `unread` is teamUnread: client replies the company has not opened. `messages` is the latest message only. `messageCount` is the full count.',
        'Filters: `status` (the four values only; others ignored), `q` (subject, REQ code, id, or client name — up to 50 name matches), `client` (a client id; ignored when it is not 24 hex), `unread=1` or `unread=true`.',
        'Rate limit: 240 requests per user per 10 minutes on every /api/client-tickets route.',
      ].join('\n\n'),
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ticketStatusEnum }, description: 'Optional. Other values are ignored.' },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Subject, REQ code, or client name.' },
        { name: 'client', in: 'query', schema: oid, description: 'Only this client\'s requests. A non-id is ignored.' },
        { name: 'unread', in: 'query', schema: { type: 'string', enum: ['1', 'true'] }, description: '1 or true: only requests with client replies the company has not opened.' },
        ...pageParams,
      ],
      success: {
        200: json('One page of client help requests.', {
          type: 'object',
          required: ['items', 'total', 'page', 'limit'],
          properties: {
            items: { type: 'array', items: { type: 'object', properties: {
              id: oid, ref: { type: 'string', example: 'REQ-9C0D1E' }, company: oid,
              client: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' }, phone: { type: 'string' } } },
              createdBy: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } },
              subject: { type: 'string' }, category: { type: 'string', enum: clientCategoryEnum }, priority: { type: 'string', enum: ticketPriorityEnum }, status: { type: 'string', enum: ticketStatusEnum },
              messages: { type: 'array', maxItems: 1, items: ticketMessage }, unread: { type: 'integer' }, messageCount: { type: 'integer' }, lastMessageAt: dateTime, createdAt: dateTime, updatedAt: dateTime,
            } } },
            total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' },
          },
        }),
      },
      extra: { 429: ref('RateLimited') },
    }),
    post: op({
      tag: 'Client tickets',
      operationId: 'clientTicketCreate',
      summary: 'Start a help conversation with a client',
      description: [
        'Who: `helpdesk:update`. 403 "You need the “Client support › Reply & change status” permission. Ask your company admin." Branch owner and company admin pass.',
        'Send `clientId` of a client in this branch. Missing or unknown: 400 "Choose the client this conversation is with". The client opens their own request from POST /api/portal/tickets and does not send clientId.',
        'Subject and text or a file, same limits as the portal. Category defaults to service. Priority defaults to normal. The client\'s unread count starts at 1 and the client is notified.',
        '400 "Describe what you need or attach a file". 400 "Give the request a subject" only if an empty subject gets past zod (zod says "Subject is required" first).',
        'Files: field `files`, 5 × 10 MB, PNG/JPG/WebP/PDF, same error strings as platform tickets. This write counts as an upload even with no file, and the route allows 240 requests per user per 10 minutes.',
        'Returns the full request. `unread` for the company is 0.',
      ].join('\n\n'),
      requestBody: multipartTicket({
        type: 'object',
        required: ['subject', 'clientId'],
        properties: { ...ticketTextProps, category: { type: 'string', enum: clientCategoryEnum }, clientId: { ...oid, description: 'Required for the company. The client must belong to this branch.' }, files: fileField },
      }, { clientId: '665f1c2a3b4d5e6f7a8b9c0d', subject: 'Scheduled visit tomorrow', body: 'Our technician will arrive between 10 and 12.', category: 'service', priority: 'normal' }),
      success: { 201: json('The created request, full thread. unread is 0 for the company.', clientTicketDetail) },
      extra: { 400: ref('ValidationError'), 429: ref('RateLimited') },
    }),
  },

  '/api/client-tickets/unread-count': {
    get: op({
      tag: 'Client tickets',
      operationId: 'clientTicketUnread',
      summary: 'Badge for client help requests',
      description: [
        'Who: `helpdesk:view` (branch owner and company admin pass). Without access the service returns zeros, but this route still requires the view permission first, so a staff user without it gets 403 rather than zeros.',
        '`unread` is requests with client replies the company has not opened. `open` is requests whose status is open or in_progress. Does not mark anything read.',
        'The portal badge is GET /api/portal/tickets/unread-count (same JSON shape, the client\'s own numbers). The platform badge is GET /api/tickets/unread-count (`unread` only).',
        'Rate limit: 240 per user per 10 minutes.',
      ].join('\n\n'),
      success: { 200: json('Company-side badge.', { type: 'object', required: ['unread', 'open'], properties: { unread: { type: 'integer' }, open: { type: 'integer' } } }, { unread: 3, open: 5 }) },
      extra: { 429: ref('RateLimited') },
    }),
  },

  '/api/client-tickets/{id}': {
    get: op({
      tag: 'Client tickets',
      operationId: 'clientTicketGet',
      summary: 'One client help request, full thread',
      description: [
        'Who: `helpdesk:view`. Only requests in this branch. 404 "Request not found" otherwise.',
        'Side effect: sets the company\'s unread count on this request to 0. Poll the unread-count route for the badge.',
        '`client` is `{ id, name, phone, email }`. `createdBy` includes `role`. `ref` is REQ- plus the last 6 hex characters. Messages and logs are complete.',
        'Rate limit: 240 per user per 10 minutes.',
      ].join('\n\n'),
      parameters: [idParam('Help request id.')],
      success: { 200: json('Full client help request. Opening it clears the company unread count.', clientTicketDetail) },
      extra: { 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },

  '/api/client-tickets/{id}/messages': {
    post: op({
      tag: 'Client tickets',
      operationId: 'clientTicketMessage',
      summary: 'Reply to a client',
      description: [
        'Who: `helpdesk:update`. 403 "You need the “Client support › Reply & change status” permission. Ask your company admin."',
        'Needs text or a file. "Write a message or attach a file". At 1000 messages: 400 "This conversation is full. Open a new request."',
        'A company reply on a closed request is refused: 400 "This request is closed. The client can reopen it, or start a new conversation." A reply while status is open sets it to in_progress. The client\'s unread count increases and the client is notified.',
        'Same `files` rules. Counts as an upload even with no file. Route limit 240 per user per 10 minutes.',
        'Returns the full request.',
      ].join('\n\n'),
      parameters: [idParam('Help request id.')],
      requestBody: multipartTicket({ type: 'object', properties: { body: ticketTextProps.body, files: fileField } }, { body: 'We can visit on Thursday.' }),
      success: { 201: json('The full request after the reply.', clientTicketDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },

  '/api/client-tickets/{id}/status': {
    put: op({
      tag: 'Client tickets',
      operationId: 'clientTicketStatus',
      summary: 'Set a client help request\'s status',
      description: [
        'Who: `helpdesk:update`. The company may set any of open, in_progress, resolved, closed. The client, on PUT /api/portal/tickets/{id}/status, may only close or reopen.',
        'The same status again returns the request and does not notify. A real change notifies the client. Log action is `reopened` when the previous status was resolved or closed and the new one is open, otherwise `status_changed`.',
        'JSON body. "Invalid ticket status" for any other status value (the shared schema uses that wording on this route too). The service\'s own fallback string "Invalid request status" is not reached when the body fails that schema.',
        'Rate limit: 240 per user per 10 minutes.',
      ].join('\n\n'),
      parameters: [idParam('Help request id.')],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ticketStatusEnum } } }, example: { status: 'resolved' } } } },
      success: { 200: json('The full request after the status change.', clientTicketDetail) },
      extra: { 400: ref('ValidationError'), 404: ref('NotFound'), 429: ref('RateLimited') },
    }),
  },
};
