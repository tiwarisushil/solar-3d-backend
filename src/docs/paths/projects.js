// Installations, the signed-in staff member's own jobs, loans, subsidies, and the branch home screen.
// Success JSON is the value itself (no { data } wrapper). Dates are ISO 8601. Ids are 24-hex strings.

const oid = { $ref: '#/components/schemas/ObjectId' };
const bearer = [{ bearerAuth: [] }];

const R = {
  400: { $ref: '#/components/responses/ValidationError' },
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  404: { $ref: '#/components/responses/NotFound' },
  409: { $ref: '#/components/responses/Conflict' },
  429: { $ref: '#/components/responses/RateLimited' },
  500: { $ref: '#/components/responses/ServerError' },
};

const errs = (...codes) => Object.fromEntries(codes.map((code) => [String(code), R[code]]));

const json = (description, schema, example) => ({
  description,
  content: { 'application/json': { schema, example } },
});

const jsonExamples = (description, schema, examples) => ({
  description,
  content: { 'application/json': { schema, examples } },
});

/** @param {Record<string, unknown>} success response map such as { 200: json(...) } */
const done = (success, ...codes) => ({ ...success, ...errs(...codes) });

function operation(tag, operationId, summary, description, { parameters, requestBody, responses }) {
  const op = { tags: [tag], operationId, summary, description, security: bearer, responses };
  if (parameters?.length) op.parameters = parameters;
  if (requestBody) op.requestBody = requestBody;
  return op;
}

const pathParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: oid,
});

const queryParam = (name, description, schema) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});

const jsonBody = (description, schema, example) => ({
  required: true,
  description,
  content: { 'application/json': { schema, example } },
});

const fileBody = (description) => ({
  required: true,
  description,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string', format: 'binary', description: 'The only part. Field name is `file`.' },
        },
      },
    },
  },
});

const STEP_STATUS = ['pending', 'in_progress', 'done'];
const STEP_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PROJECT_STATUS = ['active', 'completed'];
const AMC_VISIT_STATUS = ['pending', 'completed'];
const AMC_REQUEST_STATUS = ['requested', 'assigned', 'completed', 'cancelled'];
const AMC_VISIT_WORKFLOW = ['scheduled', 'requested', 'assigned', 'completed', 'cancelled'];
const LOAN_STATUS = ['in_progress', 'completed', 'rejected'];
const SUBSIDY_STATUS = ['in_progress', 'completed', 'rejected'];
const PRICE_TYPES = ['base', 'wholesale', 'retail'];
const PAYMENT_MODES = ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'];
const DESIGN_STATUS = ['draft', 'proposed', 'reproposed', 'negotiation', 'won', 'lost'];

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });
const dateTime = (description, { nullable = false } = {}) => ({
  type: 'string',
  format: 'date-time',
  nullable,
  description,
});
const idProp = (description) => ({ allOf: [oid], description });

const WHEN = '2026-04-02T09:30:00.000Z';
const ID = {
  project: '665f1c2a3b4d5e6f7a8b9c0d',
  design: '665f1c2a3b4d5e6f7a8b9c0e',
  client: '665f1c2a3b4d5e6f7a8b9c0f',
  step: '665f1c2a3b4d5e6f7a8b9c10',
  step2: '665f1c2a3b4d5e6f7a8b9c11',
  staff: '665f1c2a3b4d5e6f7a8b9c12',
  visit: '665f1c2a3b4d5e6f7a8b9c13',
  criterion: '665f1c2a3b4d5e6f7a8b9c14',
  loan: '665f1c2a3b4d5e6f7a8b9c15',
  doc: '665f1c2a3b4d5e6f7a8b9c16',
  subsidy: '665f1c2a3b4d5e6f7a8b9c17',
  invoice: '665f1c2a3b4d5e6f7a8b9c18',
  log: '665f1c2a3b4d5e6f7a8b9c19',
  request: '665f1c2a3b4d5e6f7a8b9c1a',
  company: '665f1c2a3b4d5e6f7a8b9c1b',
  template: '665f1c2a3b4d5e6f7a8b9c1c',
};

const uploadLimitNote = 'Uploads are limited to 60 per signed-in user per 10 minutes, and 3 uploads in flight for that user. Over either limit is 429 `RATE_LIMITED`. A file over the size limit is 400 `{ "error": "That file is too large" }` (not 413). 413 is only the 4 MB JSON body limit.';

const protectedFileNote = 'The stored path is protected. `GET /api/files/link?url=` with that `/uploads/...` path returns `{ url, expiresAt }`, a short-lived signed link. Do not load `/uploads/...` directly.';

const business400 = 'A business-rule rejection is also HTTP 400 with `{ "error" }` and no `code`. `code: "VALIDATION"` and `details.fields` are only for a body that failed the schema.';

const tasksGate = `**Who.** \`POST /api/auth/login\` token. Mounted at \`/api/projects\` behind \`withAreaAccess('tasks')\`. Branch owner (\`role: branch\`) and company admin (\`role: company\`) pass every Installations permission check. Staff (\`role: agent\`) need at least one Installations permission to reach this router, and the permission named on the route to pass it. Anyone else is 403.

**Visibility of \`{id}\`.** Before the handler, \`assertProjectVisible\` runs. **View all** (\`tasks:view\`) sees every installation in the branch. **Their team's installations** (\`tasks:view_team\`) sees one only when the caller or an active direct report is the assignee of a step or an AMC visit. Any other id, a malformed id, or a caller who has neither view permission is \`404\` \`Installation not found\` — the same body as a missing id. Company-wide AMC lists require **View all** specifically; team view is 403 there.`;

const myGate = `**Who.** Token role must be \`agent\` (\`agentOnly\`). A branch owner or company admin is 403 \`You do not have access to this area\`, even though they pass permission checks elsewhere. No Installations permission is required, except the parts-invoice routes, which still require **Invoice parts used on AMC visits** (\`tasks:invoice_parts\`).

**How this differs from \`/api/projects\`.** These routes are the jobs assigned to the signed-in staff member, not a filtered page of the company list.

- An installation is returned only when this user is the assignee of at least one step or one AMC visit. Otherwise \`404\` \`Installation not found\`. There is no team scope and no "view all".
- \`GET /api/my/projects\` is a JSON array sorted by \`updatedAt\` descending, with no \`page\`, \`q\`, or \`show\`. \`logs\` is omitted. \`GET /api/projects\` is \`{ items, total, page, limit }\`.
- Proposal and client are the field view: proposal \`name\` plus \`summary.address\`, \`summary.kwp\`, \`summary.panels\` (no \`status\`, no price). Client \`name\`, \`phone\`, \`address\` (no \`email\`). \`GET /api/projects\` and \`GET /api/projects/{id}\` always use the owner view (client email, proposal \`status\`, full \`summary\` including price).
- Staff can note, change status on a step assigned to them, upload a step photo, complete an AMC visit assigned to them, and (with the invoice permission) bill parts on a visit assigned to them. They cannot start or delete an installation, add or remove steps, edit a step's name, role, priority, or order, or assign anyone. The Kanban is only installations where they hold a step (an AMC-only assignment is in the list and the AMC list, not on the board).`;

const ownerPopulateNote = `**Response shape.** \`GET\` list and \`GET\` one always populate the owner view, even when the caller is staff: \`client\` is \`{ id, name, email, phone, address }\`, \`design\` is \`{ id, name, status, summary }\` where \`summary\` is \`address\`, \`kwp\`, \`panels\`, \`cost\`, \`annualKwh\`, \`pricing\`. Writes on \`/api/projects\` populate with the caller's role, so a staff caller gets the field view instead (no client email; proposal \`summary\` is only \`address\`, \`kwp\`, \`panels\`). \`steps.assignee\` and \`amcVisits.assignee\`, when set, are \`{ id, name, email, phone, jobTitle, roles, photo, active }\`.`;

const stepStatusRules = `**Status.** \`STEP_STATUS\` is \`pending\`, \`in_progress\`, \`done\`. Sending the status the step already has changes nothing and sends no notification. Moving forward logs \`step_started\` or \`step_completed\`. Moving backward (the new status is earlier in that list) logs \`step_reopened\`. \`pending\` clears \`startedAt\` and \`completedAt\`. \`in_progress\` sets \`startedAt\` if it was empty and clears \`completedAt\`. \`done\` sets \`completedAt\`.

Marking \`done\` requires \`lat\` and \`lng\` (the device's current position). The schema marks them optional, but the service answers 400 \`Current latitude is required\` or \`Current longitude is required\` when they are missing or out of range. Optional \`imageUrl\` (stored up to 300 characters) is written on that log entry only when the new status is \`done\`; otherwise the log's \`imageUrl\` is \`""\` and coordinates are null. The photo route does not attach itself — upload first, then send the returned \`url\` as \`imageUrl\` on this call.

When a step becomes \`done\`, the next step is auto-assigned if it has a \`role\`, has no assignee, and some active staff member has that role (fewest open steps wins). The installation's \`status\` becomes \`completed\` exactly when every step is \`done\`, and \`active\` again if a step is reopened. Completion sets \`installationCompletedAt\` and spawns the mandatory AMC visits. \`priority\` is \`low\`, \`medium\`, \`high\`, \`urgent\` (\`medium\` when omitted on create).`;

const installationLogActions = 'Installation log `action` values written by these routes: `started`, `completed`, `reopened`, `note`, `step_added`, `step_removed`, `step_renamed`, `step_assigned`, `step_unassigned`, `step_started`, `step_completed`, `step_reopened`, `amc_completed`, `amc_parts_invoiced`, `amc_assigned`, `amc_reassigned`. Visit rows keep their own log (`amc_requested`, `amc_added`, `amc_assigned`, `amc_reassigned`, `amc_completed`, `amc_parts_invoiced`).';

const staffBrief = {
  type: 'object',
  description: 'Staff member populated on a step or AMC visit.',
  properties: {
    id: idProp('User id.'),
    name: str('Display name.'),
    email: str('Email.'),
    phone: str('Phone. Empty string when unset.'),
    jobTitle: str('Legacy single job title. Prefer `roles`.'),
    roles: { type: 'array', items: { type: 'string' }, description: 'Job titles. Assignment checks this list (or `jobTitle` when `roles` is empty) against the step `role`.' },
    photo: str('Public portrait path `/uploads/...`, or empty.'),
    active: bool('False when the account cannot sign in.'),
  },
};

const activityLog = {
  type: 'object',
  properties: {
    id: idProp('Log entry id.'),
    at: dateTime('When it was written.'),
    action: str('What happened. See the route description for the values these routes write.'),
    step: { allOf: [oid], nullable: true, description: 'Installation step id this line is about, or null.' },
    stepName: str('Step or visit name copied onto the line. Empty when the line is about the installation itself.'),
    by: { allOf: [oid], nullable: true, description: 'User id of the actor.' },
    byName: str('Actor name, or email when they have no name.'),
    byRole: str('Actor role: `company`, `branch`, or `agent`.'),
    message: str('Free text. Empty when the action has nothing else to say.'),
    lat: { type: 'number', nullable: true, description: 'Latitude stored when a step was marked done. Otherwise null.' },
    lng: { type: 'number', nullable: true, description: 'Longitude stored when a step was marked done. Otherwise null.' },
    imageUrl: str('`/uploads/...` from the photo route, stored only on the log line of a transition to `done`. Empty otherwise.'),
  },
};

const installStep = {
  type: 'object',
  description: 'One step copied onto this installation. Editing the company template does not change steps already copied.',
  properties: {
    id: idProp('Step id. Send this as `stepId`.'),
    name: str('Step name, up to 80 characters.'),
    description: str('Up to 400 characters. Empty when unset.'),
    role: str('Job title the assignee must have. Empty when anyone may be assigned.'),
    priority: { type: 'string', enum: STEP_PRIORITIES, description: 'How urgent this step is. `medium` when it was not set.' },
    assignee: { ...staffBrief, nullable: true, description: 'Staff member doing this step, or null.' },
    status: { type: 'string', enum: STEP_STATUS, description: '`pending` (not started), `in_progress`, or `done`.' },
    startedAt: dateTime('Set when the step first leaves `pending`. Cleared if it returns to `pending`.', { nullable: true }),
    completedAt: dateTime('Set when status becomes `done`. Cleared when it leaves `done`.', { nullable: true }),
  },
};

const amcCriterion = {
  type: 'object',
  properties: {
    id: idProp('Checklist row id. Send this back when completing the visit.'),
    label: str('What to check, up to 200 characters.'),
    checked: bool('True once ticked. A visit cannot be completed while any row is unchecked.'),
    note: str('Optional note on this row, up to 300 characters.'),
  },
};

const amcPartLine = {
  type: 'object',
  description: 'A part recorded on the visit after it was invoiced. No id.',
  properties: {
    productName: str('Product name copied from the invoice line.'),
    qty: num('Quantity billed.'),
    unit: str('Unit label. Empty when the product has none.'),
    rate: num('Unit rate copied from the batch price used on the invoice.'),
  },
};

const visitLog = {
  type: 'object',
  properties: {
    id: idProp('Visit log id.'),
    at: dateTime('When it was written.'),
    action: str('`amc_requested`, `amc_added`, `amc_assigned`, `amc_reassigned`, `amc_completed`, or `amc_parts_invoiced`.'),
    by: { allOf: [oid], nullable: true, description: 'Actor user id. Null when the client or the system wrote the line.' },
    byName: str('Actor name. `Client` or `System` when there is no user.'),
    byRole: str('Actor role. Empty for the client or the system.'),
    message: str('What changed, up to 1000 characters.'),
  },
};

const amcVisit = {
  type: 'object',
  description: 'A visit stored on the installation (the shape inside `GET` installation, not the flat row from `GET /amc-visits`).',
  properties: {
    id: idProp('Visit id. Send this as `visitId`.'),
    name: str('AMC package name, up to 80 characters.'),
    daysAfterInstallation: { type: 'integer', nullable: true, description: 'Offset from installation completion for a mandatory visit. Null on an optional visit.' },
    kind: { type: 'string', enum: ['mandatory', 'optional'], description: '`mandatory` visits are spawned when the installation is completed. `optional` visits exist only after someone books one.' },
    price: num('Package price. `0` means free. This does not change how the visit is scheduled.'),
    description: str('Sanitized HTML from the template, or empty.'),
    criteria: { type: 'array', items: amcCriterion, description: 'Checklist copied from the template. Every row must be checked before completion.' },
    dueDate: dateTime('When the visit is due. For a booking, the requested day at local midnight.', { nullable: true }),
    clientRequestedDate: dateTime('Set when the visit came from a booking. Null on a mandatory visit the company scheduled.', { nullable: true }),
    request: { allOf: [oid], nullable: true, description: 'Design.amcRequests id this visit carries out, or null.' },
    requestNote: str('Note from the booking, up to 500 characters.'),
    workflowStatus: { type: 'string', enum: AMC_VISIT_WORKFLOW, description: '`scheduled` (mandatory, not a booking), `requested`, `assigned`, `completed`, or `cancelled`.' },
    assignee: { ...staffBrief, nullable: true, description: 'Staff member who will do the visit, or null.' },
    assigneeName: str('Copy of the assignee name at assignment time.'),
    assignedAt: dateTime('When the current assignee was set.', { nullable: true }),
    assignedBy: { allOf: [oid], nullable: true, description: 'User who assigned the current holder.' },
    status: { type: 'string', enum: AMC_VISIT_STATUS, description: '`pending` until the field work is marked complete, then `completed`. Separate from `workflowStatus`.' },
    completedAt: dateTime('When the visit was marked complete.', { nullable: true }),
    completedBy: { allOf: [oid], nullable: true, description: 'User who marked it complete.' },
    completedByName: str('Their name.'),
    completionNote: str('Note sent with completion, up to 1000 characters.'),
    parts: { type: 'array', items: amcPartLine, description: 'Filled when parts are invoiced. Empty before that.' },
    partsInvoice: { allOf: [oid], nullable: true, description: 'Invoice id, or null until parts are billed.' },
    partsInvoiceNo: str('Invoice number copied onto the visit. Empty until then.'),
    previousAssignees: {
      type: 'array',
      description: 'Earlier holders, oldest first. No row id.',
      items: {
        type: 'object',
        properties: {
          assignee: { allOf: [oid], nullable: true },
          assigneeName: str('Name at the time they held it.'),
          assignedAt: dateTime('When they were assigned.', { nullable: true }),
          replacedAt: dateTime('When they were replaced.', { nullable: true }),
        },
      },
    },
    reassignedCount: num('How many times the visit was handed to someone else. `0` if never.'),
    logs: { type: 'array', items: visitLog, description: 'Newest events are not pre-sorted on the installation document. The flat AMC list sorts them newest first.' },
  },
};

const designOwner = {
  type: 'object',
  description: 'Proposal embedded on an owner-view installation.',
  properties: {
    id: idProp('Proposal id.'),
    name: str('Proposal name.'),
    status: { type: 'string', enum: DESIGN_STATUS, description: 'Proposal stage. An installation is started only from `won`.' },
    summary: {
      type: 'object',
      properties: {
        address: str('Site address.'),
        kwp: num('System size.'),
        panels: num('Panel count.'),
        cost: num('Fallback price when `pricing.total` is absent.'),
        annualKwh: num('Estimated yearly generation.'),
        pricing: { type: 'object', nullable: true, description: 'Proposal price breakdown. `pricing.total` is the deal value the dashboard uses.' },
      },
    },
  },
};

const clientOwner = {
  type: 'object',
  properties: {
    id: idProp('Client id.'),
    name: str('Client name.'),
    email: str('Email. Empty when unset. Omitted in the field view.'),
    phone: str('Phone.'),
    address: str('Address.'),
  },
};

const projectSchema = {
  type: 'object',
  description: 'One installation. `company` is the branch id. Timestamps are the document `createdAt` and `updatedAt`.',
  properties: {
    id: idProp('Installation id.'),
    company: idProp('Branch id.'),
    design: designOwner,
    client: clientOwner,
    status: { type: 'string', enum: PROJECT_STATUS, description: '`active` until every step is `done`, then `completed`.' },
    installationCompletedAt: dateTime('When the installation first became completed. Kept if it is later reopened.', { nullable: true }),
    steps: { type: 'array', items: installStep },
    amcVisits: { type: 'array', items: amcVisit, description: 'Stored visits. Mandatory ones appear after completion (a GET of a completed installation can add newly created mandatory templates before responding).' },
    amcOptionalSelections: { type: 'array', items: { type: 'string' }, description: 'Optional AMC package names copied from the proposal when the installation was started.' },
    logs: { type: 'array', items: activityLog, description: 'Present on GET one and on writes. Omitted (the key is absent) on lists.' },
    createdAt: dateTime('When the installation was started.'),
    updatedAt: dateTime('Last save.'),
  },
};

const ownerProjectExample = {
  id: ID.project,
  company: ID.company,
  design: {
    id: ID.design,
    name: 'Sharma rooftop 5 kW',
    status: 'won',
    summary: { address: '12 MG Road, Pune', kwp: 5, panels: 10, cost: 280000, annualKwh: 7500, pricing: { total: 280000 } },
  },
  client: { id: ID.client, name: 'A. Sharma', email: 'sharma@example.com', phone: '9876543210', address: '12 MG Road, Pune' },
  status: 'active',
  installationCompletedAt: null,
  steps: [{
    id: ID.step,
    name: 'Site inspection',
    description: 'Visit the site and confirm the roof.',
    role: 'Site surveyor',
    priority: 'medium',
    assignee: { id: ID.staff, name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9876500000', jobTitle: '', roles: ['Site surveyor'], photo: '', active: true },
    status: 'in_progress',
    startedAt: WHEN,
    completedAt: null,
  }],
  amcVisits: [],
  amcOptionalSelections: [],
  logs: [{
    id: ID.log,
    at: WHEN,
    action: 'started',
    step: null,
    stepName: '',
    by: ID.staff,
    byName: 'Ravi Kumar',
    byRole: 'agent',
    message: '',
    lat: null,
    lng: null,
    imageUrl: '',
  }],
  createdAt: WHEN,
  updatedAt: WHEN,
};

const fieldProjectExample = {
  ...ownerProjectExample,
  design: { id: ID.design, name: 'Sharma rooftop 5 kW', summary: { address: '12 MG Road, Pune', kwp: 5, panels: 10 } },
  client: { id: ID.client, name: 'A. Sharma', phone: '9876543210', address: '12 MG Road, Pune' },
};
const listedProject = (project) => {
  const copy = { ...project };
  delete copy.logs;
  return copy;
};

const templateStep = {
  type: 'object',
  properties: {
    id: idProp('Template row id. Replacing the template gives every row a new id. Running installations keep the steps they already have.'),
    name: str('Up to 80 characters.'),
    description: str('Up to 400 characters.'),
    role: str('Job title from the company agent-role list, or empty.'),
    priority: { type: 'string', enum: STEP_PRIORITIES },
  },
};

const templateStepExample = {
  id: ID.template,
  name: 'Site inspection',
  description: 'Visit the site, verify roof measurements, shading and the electrical connection.',
  role: 'Site surveyor',
  priority: 'medium',
};

const amcTemplate = {
  type: 'object',
  properties: {
    id: idProp('Template row id.'),
    name: str('Package name, up to 80 characters. Bookings match this name.'),
    daysAfterInstallation: { type: 'integer', minimum: 1, maximum: 3650, nullable: true, description: 'Required for `mandatory`. Null for `optional` (those are dated when booked).' },
    kind: { type: 'string', enum: ['mandatory', 'optional'] },
    price: num('`0` is free.'),
    description: str('Sanitized HTML. Plain text sent by the client is stored as an HTML ordered list, one item per line.'),
    criteria: { type: 'array', items: { type: 'string' }, description: 'Checklist labels, up to 40, each up to 200 characters. Blank lines are dropped.' },
  },
};

const amcTemplateExample = {
  id: ID.template,
  name: '1st service',
  daysAfterInstallation: 90,
  kind: 'mandatory',
  price: 0,
  description: '<ol><li>Clean the modules</li><li>Check the inverter</li></ol>',
  criteria: ['Clean the modules', 'Check the inverter'],
};

const boardStep = {
  type: 'object',
  properties: {
    id: idProp('Step id.'),
    name: str('Step name.'),
    index: { type: 'integer', description: '1-based position on this installation.' },
    status: { type: 'string', enum: STEP_STATUS },
    priority: { type: 'string', enum: STEP_PRIORITIES },
    role: str('Job title, or empty.'),
    assignee: {
      type: 'object',
      nullable: true,
      properties: { id: idProp('Staff id.'), name: str('Staff name.') },
    },
    startedAt: dateTime('When it started.', { nullable: true }),
    completedAt: dateTime('When it was done.', { nullable: true }),
    stuck: bool('True when status is `in_progress` and `startedAt` is more than 7 days ago.'),
    mine: bool('On `/api/projects/board`, always true. On `/api/my/projects/board`, true only for steps assigned to the signed-in staff member (those are the ones they may move).'),
  },
};

const boardCard = {
  type: 'object',
  properties: {
    id: idProp('Installation id.'),
    project: str('Proposal name, or `Installation` when the proposal has no name.'),
    client: str('Client name. Empty when missing.'),
    phone: str('Client phone.'),
    address: str('Proposal `summary.address`.'),
    kwp: num('Proposal `summary.kwp`, or 0.'),
    status: { type: 'string', enum: PROJECT_STATUS },
    done: { type: 'integer', description: 'Steps with status `done`.' },
    total: { type: 'integer', description: 'Step count.' },
    current: { ...boardStep, nullable: true, description: 'First step that is not `done`, or null when every step is done.' },
    next: {
      type: 'object',
      nullable: true,
      description: 'The step after `current`, or null.',
      properties: { id: idProp('Step id.'), name: str('Step name.') },
    },
    steps: { type: 'array', items: boardStep },
    column: str('Name of `current`, or `completed` when every step is done. This matches a column `id`.'),
    installationCompletedAt: dateTime('Completion time.', { nullable: true }),
    updatedAt: dateTime('Installation `updatedAt`.'),
  },
};

const boardSchema = {
  type: 'object',
  properties: {
    columns: {
      type: 'array',
      description: 'One column per company template step name, then any step name that exists on an installation but not on the template, then a final column `id: "completed"`, `name: "Completed"`. Cards in a named column are the installations whose first not-done step has that name, stuck cards first, then priority `urgent`, `high`, `medium`, `low`, then `updatedAt` descending. The completed column is sorted by `installationCompletedAt` descending.',
      items: {
        type: 'object',
        properties: {
          id: str('Step name, or `completed`.'),
          name: str('Same as `id`, except the last column is `Completed`.'),
          count: { type: 'integer', description: 'Cards in this column.' },
          cards: { type: 'array', items: boardCard },
        },
      },
    },
    total: { type: 'integer', description: 'Installations on the board.' },
    open: { type: 'integer', description: 'Installations whose column is not `completed`.' },
  },
};

const boardExample = {
  columns: [{
    id: 'Site inspection',
    name: 'Site inspection',
    count: 1,
    cards: [{
      id: ID.project,
      project: 'Sharma rooftop 5 kW',
      client: 'A. Sharma',
      phone: '9876543210',
      address: '12 MG Road, Pune',
      kwp: 5,
      status: 'active',
      done: 0,
      total: 1,
      current: {
        id: ID.step, name: 'Site inspection', index: 1, status: 'in_progress', priority: 'medium', role: 'Site surveyor',
        assignee: { id: ID.staff, name: 'Ravi Kumar' }, startedAt: WHEN, completedAt: null, stuck: false, mine: true,
      },
      next: null,
      steps: [{
        id: ID.step, name: 'Site inspection', index: 1, status: 'in_progress', priority: 'medium', role: 'Site surveyor',
        assignee: { id: ID.staff, name: 'Ravi Kumar' }, startedAt: WHEN, completedAt: null, stuck: false, mine: true,
      }],
      column: 'Site inspection',
      installationCompletedAt: null,
      updatedAt: WHEN,
    }],
  }, { id: 'completed', name: 'Completed', count: 0, cards: [] }],
  total: 1,
  open: 1,
};

const amcNext = {
  type: 'object',
  nullable: true,
  description: 'The earliest pending visit. `id` is null when the overview calculated the visit from the template and it has not been stored yet.',
  properties: {
    id: { allOf: [oid], nullable: true },
    name: str('Visit name.'),
    kind: { type: 'string', enum: ['mandatory', 'optional'] },
    free: bool('True when `price` is 0.'),
    workflowStatus: { type: 'string', enum: AMC_VISIT_WORKFLOW, nullable: true },
    assigneeName: str('Empty when unassigned.'),
    dueDate: dateTime('Due day.', { nullable: true }),
    daysLeft: { type: 'integer', nullable: true, description: 'Whole days from today (server local midnight) until `dueDate`. Negative is overdue. Null when there is no due date.' },
    overdue: bool('True when `daysLeft` is a negative number.'),
  },
};

const amcOverviewRow = {
  type: 'object',
  properties: {
    projectId: idProp('Installation id.'),
    design: {
      type: 'object',
      nullable: true,
      properties: { id: idProp('Proposal id.'), name: str('Proposal name.'), address: str('`summary.address`.') },
    },
    client: {
      type: 'object',
      nullable: true,
      properties: { id: idProp('Client id.'), name: str('Client name.'), phone: str('Phone, or empty.') },
    },
    installationCompletedAt: dateTime('When the installation was completed. Null if this row is an in-progress job shown only because a visit is assigned (staff overview).', { nullable: true }),
    next: amcNext,
    allComplete: bool('True when there is at least one visit and none are still pending.'),
    hasSchedule: bool('True when there is at least one visit.'),
    pendingCount: { type: 'integer', description: 'Visits that are not `completed`.' },
  },
};

const amcOverviewSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: amcOverviewRow, description: 'Pending-next rows first (earliest due date), then all-complete, then no schedule. Date filters apply only when both ends of the pair are sent. `filter` values: `overdue` (next visit overdue), `upcoming` (has a next visit that is not overdue, including no date and due today), `due_soon` (next visit, not overdue, `daysLeft` ≤ 14), `pending` (has a next visit), `complete`, `no_schedule`. `all`, omitted, or any other value does not filter.' },
    total: { type: 'integer', description: 'Rows after filters.' },
    totalInstalled: { type: 'integer', description: 'Rows before filters.' },
    amcVisitNames: { type: 'array', items: { type: 'string' }, description: 'Template names, for the visit-name filter.' },
  },
};

const amcOverviewExample = {
  items: [{
    projectId: ID.project,
    design: { id: ID.design, name: 'Sharma rooftop 5 kW', address: '12 MG Road, Pune' },
    client: { id: ID.client, name: 'A. Sharma', phone: '9876543210' },
    installationCompletedAt: WHEN,
    next: { id: ID.visit, name: '1st service', kind: 'mandatory', free: true, workflowStatus: 'scheduled', assigneeName: '', dueDate: '2026-07-01T00:00:00.000Z', daysLeft: 12, overdue: false },
    allComplete: false,
    hasSchedule: true,
    pendingCount: 1,
  }],
  total: 1,
  totalInstalled: 1,
  amcVisitNames: ['1st service'],
};

const amcOverviewQuery = [
  queryParam('amcFrom', 'Inclusive start of the next visit due date. Ignored unless `amcTo` is also sent. Any string `Date` can parse.', { type: 'string' }),
  queryParam('amcTo', 'Inclusive end of the next visit due date (through 23:59:59.999 local). Ignored unless `amcFrom` is also sent.', { type: 'string' }),
  queryParam('installedFrom', 'Inclusive start of `installationCompletedAt`. Ignored unless `installedTo` is also sent.', { type: 'string' }),
  queryParam('installedTo', 'Inclusive end of `installationCompletedAt`. Ignored unless `installedFrom` is also sent.', { type: 'string' }),
  queryParam('nextAmc', 'Exact next-visit name. Empty omits the filter.', { type: 'string' }),
  queryParam('filter', 'One of `overdue`, `upcoming`, `due_soon`, `pending`, `complete`, `no_schedule`, `all`.', { type: 'string', enum: ['overdue', 'upcoming', 'due_soon', 'pending', 'complete', 'no_schedule', 'all'] }),
];

const visitAssignee = {
  type: 'object',
  nullable: true,
  properties: { id: idProp('Staff id.'), name: str('Name copied at assignment.') },
};

const amcVisitRow = {
  type: 'object',
  description: 'One flat row from the AMC visit list. A company-wide placeholder for a booking whose installation has not started uses a different, smaller shape: `id` is `request:<booking id>`, `projectId` and `projectStatus` are null, `needsInstallation` is true, `kind` is `optional`, `free` is false, `price` is 0, `criteria` is `[]`, `booked` is true, `assignee` is null, `status` is `pending`. Those placeholders have no visit to assign until someone starts the installation. Real rows omit `needsInstallation`.',
  properties: {
    id: str('Visit id, or `request:<24 hex>` on a placeholder.'),
    projectId: { allOf: [oid], nullable: true },
    projectStatus: { type: 'string', enum: PROJECT_STATUS, nullable: true },
    name: str('Package or visit name.'),
    kind: { type: 'string', enum: ['mandatory', 'optional'] },
    free: bool('True when the stored price is 0.'),
    price: num('Package price.'),
    description: str('Present on stored visits. Omitted on placeholders.'),
    criteria: { type: 'array', items: amcCriterion },
    dueDate: dateTime('Due day.', { nullable: true }),
    daysLeft: { type: 'integer', nullable: true, description: 'Days from today until `dueDate`. Negative is overdue.' },
    clientRequestedDate: dateTime('Booking day, or null.', { nullable: true }),
    requestNote: str('Booking note.'),
    booked: bool('True for a mandatory visit (the company scheduled it) and for an optional visit that has a requested date.'),
    needsInstallation: bool('True only on a placeholder whose proposal has no installation yet.'),
    assignee: visitAssignee,
    assignedAt: dateTime('When the current assignee was set.', { nullable: true }),
    reassigned: bool('True when `reassignedCount` > 0.'),
    reassignedCount: { type: 'integer' },
    previousAssignees: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { allOf: [oid], nullable: true, description: 'Previous assignee user id.' },
          name: str('Their name.'),
          assignedAt: dateTime('When they were assigned.', { nullable: true }),
          replacedAt: dateTime('When they were replaced.', { nullable: true }),
        },
      },
    },
    logs: { type: 'array', items: { type: 'object', properties: { id: idProp('Log id.'), at: dateTime('When.'), action: str('Visit log action.'), byName: str('Actor.'), message: str('Text.') } }, description: 'Newest first.' },
    status: { type: 'string', enum: AMC_VISIT_STATUS },
    completedAt: dateTime('Completion time.', { nullable: true }),
    completedByName: str('Who completed it.'),
    completionNote: str('Completion note.'),
    parts: { type: 'array', items: amcPartLine },
    partsInvoice: {
      type: 'object',
      nullable: true,
      properties: { id: idProp('Invoice id.'), invoiceNo: str('Invoice number.') },
    },
    design: { type: 'object', nullable: true, properties: { id: idProp('Proposal id.'), name: str('Name.'), address: str('Address.') } },
    client: { type: 'object', nullable: true, properties: { id: idProp('Client id.'), name: str('Name.'), phone: str('Phone.') } },
    installationCompletedAt: dateTime('Installation completion.', { nullable: true }),
  },
};

const amcVisitsSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: amcVisitRow, description: 'Pending visits first (earliest due date), then completed (most recently completed first).' },
    total: { type: 'integer' },
    amcNames: { type: 'array', items: { type: 'string' }, description: 'Every template name, including ones with no visit yet.' },
    amcTemplates: {
      type: 'array',
      items: { type: 'object', properties: { name: str('Template name.'), kind: { type: 'string', enum: ['mandatory', 'optional'] } } },
    },
  },
};

const amcVisitRowExample = {
  id: ID.visit,
  projectId: ID.project,
  projectStatus: 'completed',
  name: '1st service',
  kind: 'mandatory',
  free: true,
  price: 0,
  description: '',
  criteria: [{ id: ID.criterion, label: 'Clean the modules', checked: false, note: '' }],
  dueDate: '2026-07-01T00:00:00.000Z',
  daysLeft: 12,
  clientRequestedDate: null,
  requestNote: '',
  booked: true,
  assignee: null,
  assignedAt: null,
  reassigned: false,
  reassignedCount: 0,
  previousAssignees: [],
  logs: [],
  status: 'pending',
  completedAt: null,
  completedByName: '',
  completionNote: '',
  parts: [],
  partsInvoice: null,
  design: { id: ID.design, name: 'Sharma rooftop 5 kW', address: '12 MG Road, Pune' },
  client: { id: ID.client, name: 'A. Sharma', phone: '9876543210' },
  installationCompletedAt: WHEN,
};

const amcRequestsSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Bookings that are not `completed` or `cancelled`, soonest `requestedDate` first. Draft proposals are excluded.',
      items: {
        type: 'object',
        properties: {
          id: idProp('Booking id (`requestId`).'),
          designId: idProp('Proposal id.'),
          designName: str('Proposal name.'),
          designStatus: { type: 'string', enum: DESIGN_STATUS },
          projectId: { allOf: [oid], nullable: true, description: 'Installation id, or null when the installation has not been started. Assignment is rejected until it exists.' },
          client: { type: 'object', nullable: true, properties: { id: idProp('Client id.'), name: str('Name.'), phone: str('Phone.') } },
          packageName: str('AMC template name.'),
          requestedDate: dateTime('Preferred day.'),
          note: str('Booking note.'),
          status: { type: 'string', enum: ['requested', 'assigned'], description: 'Only open bookings are listed.' },
          requestedAt: dateTime('When the booking was made.'),
          assignee: visitAssignee,
        },
      },
    },
    total: { type: 'integer' },
  },
};

const lifecycleEvent = {
  type: 'object',
  properties: {
    id: str('Log id, or a synthetic id such as `legacy-created` when an older record has no created-event.'),
    at: dateTime('When it happened. The array is oldest first.'),
    action: str('Log action. Installation values are listed on the installation routes. Client and design phases use whatever those records stored.'),
    phase: { type: 'string', enum: ['client', 'design', 'installation'] },
    stepName: str('Step name, or empty.'),
    byName: str('Actor name.'),
    byRole: str('Actor role, or empty.'),
    message: str('Text.'),
    lat: { type: 'number', nullable: true },
    lng: { type: 'number', nullable: true },
    imageUrl: str('Photo path, or empty.'),
  },
};

const lifecycleOwner = {
  type: 'object',
  properties: {
    design: {
      type: 'object',
      properties: {
        id: idProp('Proposal id.'),
        name: str('Proposal name.'),
        status: { type: 'string', enum: DESIGN_STATUS },
        createdAt: dateTime('Proposal createdAt.'),
        summary: designOwner.properties.summary,
      },
    },
    client: { ...clientOwner, nullable: true, description: 'Populated client `{ id, name, email, phone }`, or null.' },
    installation: {
      type: 'object',
      nullable: true,
      properties: {
        id: idProp('Installation id.'),
        status: { type: 'string', enum: PROJECT_STATUS },
        startedAt: dateTime('Installation `createdAt`.'),
      },
    },
    events: { type: 'array', items: lifecycleEvent },
  },
};

const invoicePricingLine = {
  type: 'object',
  description: 'One frozen invoice line. A stock line may be split into one line per batch.',
  properties: {
    productId: str('Product id.'),
    batch: str('Batch id, or empty.'),
    batchNo: str('Batch number copied at issue time.'),
    serials: { type: 'array', items: { type: 'string' } },
    priceType: { type: 'string', enum: PRICE_TYPES, description: 'Which batch price was used.' },
    name: str('Product name.'),
    detail: str('Extra text. Serials are in `serials`.'),
    hsn: str('HSN code.'),
    qty: num('Quantity.'),
    unit: str('Unit. `Nos` when the product has none.'),
    rate: num('Unit rate from the batch, ex-GST.'),
    amount: num('Line amount after a document-level discount (these AMC invoices send no discount, so this matches `gross`).'),
    gross: num('`qty` × `rate` before a discount.'),
    gstPercent: num('GST percent applied. 0 when `withGst` was false. Otherwise the product percent, or 18 when the product has none.'),
    taxable: num('Amount before GST.'),
    gstAmount: num('GST on this line.'),
    lineTotal: num('What this line adds to the invoice total.'),
  },
};

const amcInvoiceView = {
  type: 'object',
  properties: {
    invoice: {
      type: 'object',
      description: 'The stored invoice. `kind` is `amc_parts`. `pricing` is frozen at issue time.',
      properties: {
        id: idProp('Invoice id.'),
        company: idProp('Branch id.'),
        design: idProp('Proposal id.'),
        client: idProp('Client id.'),
        invoiceNo: str('Invoice number.'),
        issuedOn: dateTime('Issue time.'),
        title: str('`"<visit name> — parts used · <proposal name>"`, cut at 160 characters.'),
        total: num('Invoice total.'),
        kind: { type: 'string', enum: ['amc_parts'] },
        status: { type: 'string', enum: ['issued', 'void'], description: 'A new parts invoice is `issued`.' },
        pdfName: str('Stored PDF filename once archived, otherwise empty. Not a URL.'),
        termsAndConditions: str('Company PDF terms copied onto the invoice, sanitized HTML.'),
        createdByName: str('Name of the user who billed the parts.'),
        pricing: {
          type: 'object',
          properties: {
            lines: { type: 'array', items: invoicePricingLine },
            subtotal: num('Sum of line amounts.'),
            discountAmount: num('Always 0 for this route (no discount is sent).'),
            discount: num('0.'),
            discountIsPercent: bool('False.'),
            discountRemark: str('Empty.'),
            proposalDiscountAmount: num('0.'),
            extraDiscount: num('0.'),
            extraDiscountIsPercent: bool('False.'),
            extraDiscountRemark: str('Empty.'),
            extraDiscountAmount: num('0.'),
            taxableTotal: num('Sum of line taxable amounts.'),
            gstTotal: num('Sum of line GST.'),
            taxByHsn: { type: 'array', items: { type: 'object', properties: { hsn: str('HSN, or an em dash when the line has none.'), taxable: num('Taxable total for that HSN.'), gst: num('GST for that HSN.'), rate: { type: 'number', nullable: true, description: 'The single GST rate, or null when the HSN mixed rates.' } } } },
            gstIncluded: bool('False. Rates are ex-GST and tax is added on top when `withGst` is true.'),
            gstRate: num('Highest line GST percent.'),
            total: num('Same as `invoice.total`.'),
            invoiceGstMode: { type: 'string', enum: ['with_gst', 'without_gst'] },
            withGst: bool('True unless the request sent `withGst: false`.'),
            paymentTerms: str('Empty on this route.'),
          },
        },
        createdAt: dateTime('Created.'),
        updatedAt: dateTime('Updated.'),
      },
    },
    client: {
      type: 'object',
      nullable: true,
      description: 'Bill-to client.',
      properties: {
        id: idProp('Client id.'),
        name: str('Name.'),
        email: str('Email.'),
        phone: str('Phone.'),
        address: str('Address.'),
        gstNumber: str('GSTIN.'),
        pan: str('PAN.'),
      },
    },
    design: { type: 'object', nullable: true, properties: { id: idProp('Proposal id.'), name: str('Proposal name.') } },
    visit: {
      type: 'object',
      properties: {
        id: idProp('Visit id.'),
        name: str('Visit name.'),
        parts: { type: 'array', items: amcPartLine },
        partsInvoiceNo: str('Invoice number.'),
      },
    },
  },
};

const amcInvoiceExample = {
  invoice: {
    id: ID.invoice,
    company: ID.company,
    design: ID.design,
    client: ID.client,
    invoiceNo: 'INV-0008',
    issuedOn: WHEN,
    title: '1st service — parts used · Sharma rooftop 5 kW',
    total: 1180,
    kind: 'amc_parts',
    status: 'issued',
    pdfName: '',
    termsAndConditions: '',
    createdByName: 'Ravi Kumar',
    pricing: {
      lines: [{
        productId: ID.template, batch: ID.doc, batchNo: 'B-14', serials: [], priceType: 'retail',
        name: 'DC MCB', detail: '', hsn: '8536', qty: 1, unit: 'Nos', rate: 1000, amount: 1000, gross: 1000,
        gstPercent: 18, taxable: 1000, gstAmount: 180, lineTotal: 1180,
      }],
      subtotal: 1000, discountAmount: 0, discount: 0, discountIsPercent: false, discountRemark: '',
      proposalDiscountAmount: 0, extraDiscount: 0, extraDiscountIsPercent: false, extraDiscountRemark: '', extraDiscountAmount: 0,
      taxableTotal: 1000, gstTotal: 180, taxByHsn: [{ hsn: '8536', taxable: 1000, gst: 180, rate: 18 }],
      gstIncluded: false, gstRate: 18, total: 1180, invoiceGstMode: 'with_gst', withGst: true, paymentTerms: '',
    },
    createdAt: WHEN,
    updatedAt: WHEN,
  },
  client: { id: ID.client, name: 'A. Sharma', email: 'sharma@example.com', phone: '9876543210', address: '12 MG Road, Pune', gstNumber: '', pan: '' },
  design: { id: ID.design, name: 'Sharma rooftop 5 kW' },
  visit: { id: ID.visit, name: '1st service', parts: [{ productName: 'DC MCB', qty: 1, unit: 'Nos', rate: 1000 }], partsInvoiceNo: 'INV-0008' },
};

const partsInvoiceBody = {
  type: 'object',
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      description: 'Parts taken from stock. Each line needs `productId`. Non-serialized products need `qty` > 0 (400 `Enter the quantity of <product>` when it is missing). Serialized products need `serials` (400 `Choose the serial numbers of <product>`). `batch` empty or omitted uses oldest batches first. `priceType` omitted becomes `retail`. The rate is that batch price and is ex-GST.',
      items: {
        type: 'object',
        required: ['productId'],
        properties: {
          productId: idProp('Catalog product id.'),
          qty: num('Quantity. Required for a product that is not tracked by serial number.'),
          batch: str('Batch id, or `""` to take oldest stock first.'),
          serials: { type: 'array', maxItems: 2000, items: { type: 'string', maxLength: 80 }, description: 'Serial numbers. Required when the product is serialized. Each serial must be `inStock`.' },
          priceType: { type: 'string', enum: PRICE_TYPES, description: '`base`, `wholesale`, or `retail`. Omit for `retail`.' },
        },
      },
    },
    withGst: bool('Default true when omitted. False issues the invoice with no GST.'),
    note: str('Optional note, up to 300 characters, stored on the installation log and the visit log.'),
  },
};

const idParams = [pathParam('id', 'Installation id.')];
const stepParams = [pathParam('id', 'Installation id.'), pathParam('stepId', 'Step id on that installation. A malformed id is 404 `Step not found`.')];
const visitParams = [pathParam('id', 'Installation id.'), pathParam('visitId', 'AMC visit id on that installation. A malformed id is 404 `AMC visit not found`.')];

const listQuery = [
  queryParam('page', 'Page number. Values below 1 and non-numbers become 1.', { type: 'integer', minimum: 1, default: 1 }),
  queryParam('limit', 'Page size. Clamped to 1–200. Default 50.', { type: 'integer', minimum: 1, maximum: 200, default: 50 }),
  queryParam('from', 'Inclusive `updatedAt` lower bound, `YYYY-MM-DD` (UTC midnight). Any other shape is ignored.', { type: 'string', format: 'date' }),
  queryParam('to', 'Inclusive `updatedAt` upper bound, `YYYY-MM-DD` (UTC end of that day). Any other shape is ignored. Either bound may be sent alone.', { type: 'string', format: 'date' }),
  queryParam('show', 'Dashboard preset. `stuck`: active, with a step `in_progress` whose `startedAt` is more than 7 days ago. `unassigned`: active, with a not-done step and a null assignee. `finished_month`: `installationCompletedAt` on or after the 1st of this month (server local). Any other value is ignored.', { type: 'string', enum: ['stuck', 'unassigned', 'finished_month'] }),
  queryParam('q', 'Case-insensitive match on proposal name or client name. Only the first 80 characters are used.', { type: 'string' }),
];

const noteBody = jsonBody(
  'A note on the installation timeline. Optional `step` (not in the schema, ignored by nothing — the service reads it) attaches the log line to that step. An unknown step id is 404 `Step not found`.',
  {
    type: 'object',
    required: ['message'],
    properties: {
      message: str('Required. Trimmed. Up to 1000 characters.', { maxLength: 1000 }),
      step: idProp('Optional step id to attach this note to.'),
    },
  },
  { message: 'Client asked to move the inverter to the north wall.', step: ID.step },
);

const stepWriteProps = {
  name: str('Required on create. Up to 80 characters.'),
  description: str('Up to 400 characters.'),
  role: str('A job title from the company agent-role list, or `""`. Any other value is 400 `Choose a role from your list`.'),
  assignee: str('Staff user id, or `""` to leave it (create) or clear it (update). Must be an agent of this branch. When the step has a role, the agent must have that role or the response is 400 `This step is for “<role>”. Choose an agent with that role.` Unknown agent is 400 `Choose one of your agents`.'),
  priority: { type: 'string', enum: STEP_PRIORITIES, description: 'Omit on create for `medium`.' },
};

const projectListSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: projectSchema, description: '`logs` is omitted on each item.' },
    total: { type: 'integer', description: 'Matches the filter, not just this page.' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
  },
};

const okProject = (description, example = ownerProjectExample) => json(description, projectSchema, example);

const mastersNote = '**Masters.** This template is shared by every branch. Only a company admin can change it, or the branch owner when the organization has no branches. Anyone else is 403 `Only your company admin can change these settings.` Saving replaces the whole list. Installations already started keep the steps or visits they already have. A new mandatory AMC is also added onto installations that are already completed.';

const installationPaths = {
  '/api/projects/steps': {
    get: operation('Projects', 'projectListSteps', 'List the installation step template', `${tasksGate}

**Permission.** Installations › View all or Their team's installations (\`tasks:view\` or \`tasks:view_team\`).

**Behaviour.** Returns the branch's installation step template as a JSON array (possibly empty). This is the checklist copied when an installation is started. It is not the steps of one job.

${business400}`, { responses: done({ 200: json('The template, in the saved order.', { type: 'array', items: templateStep }, [templateStepExample]) }, 401, 403, 500) }),
    put: operation('Projects', 'projectUpdateSteps', 'Replace the installation step template', `${tasksGate}

${mastersNote}

**Permission.** Masters, not an Installations permission. There is no zod schema on this route. The service requires \`steps\` to be an array of at most 30 objects. Each \`name\` is required. \`description\` is stored as sent (mongoose rejects more than 400 characters with 400). \`role\` blank is stored as \`""\`; any other value must match the company agent-role list (match is case-insensitive, the stored value is the list's spelling). \`priority\` omitted, null, or \`""\` becomes \`medium\`; anything else must be \`low\`, \`medium\`, \`high\`, or \`urgent\`.

**Behaviour.** Replaces \`installationSteps\` and returns the saved array, including new ids.

${business400}`, {
      requestBody: jsonBody('The whole template.', {
        type: 'object',
        required: ['steps'],
        properties: {
          steps: {
            type: 'array',
            maxItems: 30,
            items: { type: 'object', required: ['name'], properties: { name: str('Required, up to 80 characters.'), description: str('Up to 400 characters.'), role: str('Agent-role label, or empty.'), priority: { type: 'string', enum: STEP_PRIORITIES } } },
          },
        },
      }, { steps: [{ name: 'Site inspection', description: 'Visit the site and confirm the roof.', role: 'Site surveyor', priority: 'medium' }] }),
      responses: done({ 200: json('The saved template.', { type: 'array', items: templateStep }, [templateStepExample]) }, 400, 401, 403, 500),
    }),
  },

  '/api/projects/amc-templates': {
    get: operation('Projects', 'projectListAmcTemplates', 'List AMC schedules', `${tasksGate}

**Permission.** Installations › View all or Their team's installations.

**Behaviour.** Returns the branch AMC template array (empty when none have been saved). \`criteria\` here are strings. On a visit they become checklist rows with ids.`, { responses: done({ 200: json('AMC schedules, in stored order.', { type: 'array', items: amcTemplate }, [amcTemplateExample]) }, 401, 403, 500) }),
    put: operation('Projects', 'projectUpdateAmcTemplates', 'Replace AMC schedules', `${tasksGate}

${mastersNote}

**Permission.** Masters.

**Behaviour.** Replaces \`amcTemplates\`. At most 20 rows. \`kind\` omitted or anything other than \`optional\` is stored as \`mandatory\`. A mandatory row must include \`daysAfterInstallation\` (integer 1–3650); missing it is 400 \`Days after installation is required for mandatory visits\`. An optional row stores \`daysAfterInstallation: null\` even if a number was sent. \`price\` omitted is 0. \`description\` is sanitized HTML (the same allow-list as proposal terms: paragraphs, headings, lists, bold, italic, links). Plain text is turned into an HTML ordered list, one item per non-empty line. More than 30000 characters of HTML, or more than 6000 characters of visible text, is 400 (the message says "terms & conditions"). \`criteria\` keeps up to 40 non-empty labels. The saved list is sorted by days, then name. The response is that saved array. Completed installations gain any new mandatory visits.

${business400}`, {
      requestBody: jsonBody('The whole schedule.', {
        type: 'object',
        required: ['templates'],
        properties: {
          templates: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: str('Required, up to 80 characters.'),
                daysAfterInstallation: { type: 'integer', minimum: 1, maximum: 3650, nullable: true },
                kind: { type: 'string', enum: ['mandatory', 'optional'] },
                price: num('0 or a positive number.'),
                description: str('Plain text or HTML, up to 30000 characters.'),
                criteria: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 200 } },
              },
            },
          },
        },
      }, { templates: [{ name: '1st service', daysAfterInstallation: 90, kind: 'mandatory', price: 0, description: 'Clean the modules\nCheck the inverter', criteria: ['Clean the modules', 'Check the inverter'] }] }),
      responses: done({ 200: json('The saved schedules.', { type: 'array', items: amcTemplate }, [amcTemplateExample]) }, 400, 401, 403, 500),
    }),
  },

  '/api/projects/amc-overview': {
    get: operation('Projects', 'projectAmcOverview', 'AMC tracker for completed installations', `${tasksGate}

**Permission.** Installations › View all only (\`tasks:view\`). Team view is 403.

**Behaviour.** Completed installations in the branch, each with its next pending AMC. This read does not create visit rows, so \`next.id\` can be null when the visit is still only calculated from the template. \`GET /api/projects/{id}\` and the visit list do store those mandatory visits.`, {
      parameters: amcOverviewQuery,
      responses: done({ 200: json('Tracker rows.', amcOverviewSchema, amcOverviewExample) }, 401, 403, 500),
    }),
  },

  '/api/projects/amc-visits': {
    get: operation('Projects', 'projectAmcVisits', 'Every AMC visit in the branch', `${tasksGate}

**Permission.** Installations › View all only.

**Behaviour.** Stored visits on completed installations and on any installation that already has a visit, plus a placeholder row for each still-\`requested\` booking whose proposal has no installation yet. Reading this list stores missing mandatory visits on completed installations. Placeholders cannot be assigned or completed here; start the installation first, then assign the real visit.

Staff do not use this path. Their list is \`GET /api/my/projects/amc-visits\`, which returns only visits assigned to them and has no placeholders.`, { responses: done({ 200: json('Visit rows.', amcVisitsSchema, { items: [amcVisitRowExample], total: 1, amcNames: ['1st service'], amcTemplates: [{ name: '1st service', kind: 'mandatory' }] }) }, 401, 403, 500) }),
  },

  '/api/projects/board': {
    get: operation('Projects', 'projectStepBoard', 'Installation Kanban', `${tasksGate}

**Permission.** Installations › View all or Their team's installations. Team view limits cards to installations someone on that team is assigned to (a step or an AMC visit).

**Behaviour.** Every installation in that scope, as cards. The card sits in the column of its first step that is not \`done\`, or in \`completed\` when all steps are done. \`mine\` is true on every step (the company board does not restrict who may drag). Build the board from \`columns\`. Do not invent columns: names come from the template plus any extra step names already on a job.

There is no request body and no query.`, { responses: done({ 200: json('Columns and cards.', boardSchema, boardExample) }, 401, 403, 500) }),
  },

  '/api/projects/amc-requests': {
    get: operation('Projects', 'projectListAmcRequests', 'Open AMC bookings', `${tasksGate}

**Permission.** Installations › View all only.

**Behaviour.** Client and company bookings that are still \`requested\` or \`assigned\`, across non-draft proposals.`, {
      parameters: [queryParam('status', 'Omit or `all` for both open statuses. `requested` or `assigned` keeps only that status. Completed and cancelled bookings are never listed.', { type: 'string', enum: ['requested', 'assigned', 'all'] })],
      responses: done({
        200: json('Open bookings.', amcRequestsSchema, {
          items: [{
            id: ID.request, designId: ID.design, designName: 'Sharma rooftop 5 kW', designStatus: 'won', projectId: ID.project,
            client: { id: ID.client, name: 'A. Sharma', phone: '9876543210' }, packageName: 'Panel cleaning',
            requestedDate: '2026-04-10T00:00:00.000Z', note: 'Morning preferred', status: 'requested', requestedAt: WHEN, assignee: null,
          }],
          total: 1,
        }),
      }, 401, 403, 500),
    }),
  },

  '/api/projects/amc-requests/{designId}/{requestId}/assign': {
    put: operation('Projects', 'projectAssignAmcRequest', 'Assign staff to an AMC booking', `${tasksGate}

**Permission.** Installations › Assign steps (\`tasks:assign\`).

**Behaviour.** Sets the booking to \`assigned\` and mirrors that onto the installation visit (creating the visit from the template when the installation does not have it yet). The assignee must be an active agent of this branch. 400 \`Start the installation for this proposal first — the assigned staff completes the visit there.\` when the proposal has no installation. 400 \`This AMC request is already closed\` when the booking is \`completed\` or \`cancelled\`. 400 \`Choose an active staff member\` for a missing, inactive, or non-agent user. 404 \`Proposal not found\` or \`AMC request not found\`.

The response is not the installation. The portal booking is updated in the same call.

${business400}`, {
      parameters: [pathParam('designId', 'Proposal id.'), pathParam('requestId', 'Booking id from the AMC request list.')],
      requestBody: jsonBody('Who will do the visit.', { type: 'object', required: ['assigneeId'], properties: { assigneeId: idProp('Active staff user id.') } }, { assigneeId: ID.staff }),
      responses: done({
        200: json('Assignment stored.', {
          type: 'object',
          properties: {
            ok: bool('True.'),
            request: {
              type: 'object',
              properties: {
                id: idProp('Booking id.'),
                packageName: str('Template name.'),
                requestedDate: dateTime('Preferred day.'),
                note: str('Note.'),
                status: { type: 'string', enum: AMC_REQUEST_STATUS },
                requestedAt: dateTime('When it was requested.'),
                byCompany: bool('True when the company raised the booking, false when the client did.'),
                assignee: visitAssignee,
              },
            },
          },
        }, {
          ok: true,
          request: { id: ID.request, packageName: 'Panel cleaning', requestedDate: '2026-04-10T00:00:00.000Z', note: 'Morning preferred', status: 'assigned', requestedAt: WHEN, byCompany: false, assignee: { id: ID.staff, name: 'Ravi Kumar' } },
        }),
      }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/assignees': {
    get: operation('Projects', 'projectListAssignees', 'Staff who can be assigned installation work', `${tasksGate}

**Permission.** Installations › Assign steps (\`tasks:assign\`). View is not required, but the caller still needs some Installations permission to pass the router (Assign steps is enough).

**Behaviour.** Every agent of the branch, active and inactive, sorted by name. This is the assign dropdown, not the staff-admin list. \`roles\` is the job-title list; when that list is empty and \`jobTitle\` is set, \`roles\` is \`[jobTitle]\`.`, {
      responses: done({
        200: json('Assignable staff.', {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: idProp('User id. Send as `assignee` or `assigneeId`.'),
              name: str('Name.'),
              photo: str('Public portrait path, or empty.'),
              active: bool('False when they cannot sign in. The dropdown can still show them; assigning an inactive person to an AMC visit is rejected.'),
              roles: { type: 'array', items: { type: 'string' }, description: 'Job titles used to match a step `role`.' },
            },
          },
        }, [{ id: ID.staff, name: 'Ravi Kumar', photo: '', active: true, roles: ['Site surveyor'] }]),
      }, 401, 403, 500),
    }),
  },

  '/api/projects': {
    get: operation('Projects', 'projectList', 'List installations', `${tasksGate}

**Permission.** Installations › View all or Their team's installations.

**Behaviour.** A page of installations, newest \`updatedAt\` first. \`logs\` is left out. Team view adds the team filter on top of \`q\`, \`show\`, and the date range. ${ownerPopulateNote}

${installationLogActions}`, {
      parameters: listQuery,
      responses: done({
        200: json('One page.', projectListSchema, { items: [listedProject(ownerProjectExample)], total: 1, page: 1, limit: 50 }),
      }, 401, 403, 500),
    }),
    post: operation('Projects', 'projectStart', 'Start an installation from a won proposal', `${tasksGate}

**Permission.** Installations › Start (\`tasks:create\`).

**Behaviour.** Copies the current installation step template onto a new installation for that proposal, copies \`amcOptionalSelections\`, and mirrors any AMC bookings already on the proposal into visits. The first step is auto-assigned when it has a role and an active staff member has that role. One installation per proposal: a second start is 409 \`This design already has an installation\`. The proposal must be \`won\` or the response is 400 \`Only a booked (won) proposal can start an installation\`. An empty template is 400 \`Set up your installation steps first\`. Unknown proposal is 404 \`Design not found\`.

The response is the new installation including the \`started\` log (and \`step_assigned\` when auto-assign ran), populated for the caller's role.

${business400}`, {
      requestBody: jsonBody('The won proposal to install.', { type: 'object', required: ['design'], properties: { design: idProp('Proposal id.') } }, { design: ID.design }),
      responses: done({ 201: okProject('The new installation.', ownerProjectExample) }, 400, 401, 403, 404, 409, 500),
    }),
  },

  '/api/projects/{id}/lifecycle': {
    get: operation('Projects', 'projectLifecycle', 'Installation timeline with the proposal and client history', `${tasksGate}

**Permission.** Installations › View all or Their team's installations.

**Behaviour.** Events from the client record, the proposal, and this installation, oldest first. Owner view includes the proposal summary and the client contact fields above. A missing created-event on an older client or proposal is filled in so the timeline still starts. 404 \`Installation not found\` when the id is outside the caller's scope.

${installationLogActions}`, {
      parameters: idParams,
      responses: done({
        200: json('Merged timeline.', lifecycleOwner, {
          design: { id: ID.design, name: 'Sharma rooftop 5 kW', status: 'won', createdAt: WHEN, summary: ownerProjectExample.design.summary },
          client: { id: ID.client, name: 'A. Sharma', email: 'sharma@example.com', phone: '9876543210' },
          installation: { id: ID.project, status: 'active', startedAt: WHEN },
          events: [{ id: 'p-0', at: WHEN, action: 'started', phase: 'installation', stepName: '', byName: 'Ravi Kumar', byRole: 'agent', message: '', lat: null, lng: null, imageUrl: '' }],
        }),
      }, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}': {
    get: operation('Projects', 'projectGet', 'Get one installation', `${tasksGate}

**Permission.** Installations › View all or Their team's installations.

**Behaviour.** The installation including \`logs\`. ${ownerPopulateNote} On a completed installation this GET stores any mandatory AMC visits that were added to the template after completion, then returns them in \`amcVisits\`.

${installationLogActions}`, {
      parameters: idParams,
      responses: done({ 200: okProject('The installation.') }, 401, 403, 404, 500),
    }),
    delete: operation('Projects', 'projectDelete', 'Delete an installation', `${tasksGate}

**Permission.** Installations › Delete (\`tasks:delete\`).

**Behaviour.** Deletes that installation document and returns \`{ "ok": true }\`. This handler does not delete the proposal, the loan, the subsidy, or uploaded files. A caller who can delete but cannot view still gets 404 for every id, because the visibility guard matches nothing. 404 \`Installation not found\` when it is missing or out of scope.`, {
      parameters: idParams,
      responses: done({ 200: json('Deleted.', { type: 'object', required: ['ok'], properties: { ok: bool('True.') } }, { ok: true }) }, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/notes': {
    post: operation('Projects', 'projectAddNote', 'Add a note on an installation', `${tasksGate}

**Permission.** Any one of Installations › Edit steps, Assign steps, or Update step status (\`tasks:update\`, \`tasks:assign\`, \`tasks:change_status\`).

**Behaviour.** Appends a \`note\` log and returns the installation. 400 \`Write a note first\` when the message is blank. ${business400}`, {
      parameters: idParams,
      requestBody: noteBody,
      responses: done({ 201: okProject('The installation, with the new note in `logs`.') }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/steps': {
    post: operation('Projects', 'projectAddStep', 'Add a step to one installation', `${tasksGate}

**Permission.** Installations › Edit steps (\`tasks:update\`) to add the step. Sending \`assignee\` also requires Assign steps, or the response is 403 \`You need the “Installations › Assign steps” permission. Ask your company admin.\`

**Behaviour.** Appends a step (status \`pending\`) and returns the installation. At most 30 steps (400 \`An installation can have up to 30 steps\`). ${stepStatusRules}

${business400}`, {
      parameters: idParams,
      requestBody: jsonBody('The new step. `name` is required. Other fields are optional.', { type: 'object', required: ['name'], properties: stepWriteProps }, { name: 'Net metering', description: 'File the paperwork.', role: 'Supervisor', assignee: ID.staff, priority: 'high' }),
      responses: done({ 201: okProject('The installation, including the new step.') }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/steps/{stepId}': {
    put: operation('Projects', 'projectUpdateStep', 'Edit, assign, move, or change a step', `${tasksGate}

**Permission.** The route accepts Edit steps, Assign steps, or Update step status. The service then checks the part you actually change:

- \`name\`, \`description\`, \`role\`, \`priority\`, or \`move\` requires Edit steps.
- \`assignee\` (including clearing it) requires Assign steps, and only when the value changes.
- \`status\` requires Update step status.

A missing piece is 403 \`You need the “Installations › <label>” permission. Ask your company admin.\` with label Edit steps, Assign steps, or Update step status.

**Behaviour.** Partial update: omit a key to leave it. \`move\` is \`up\` or \`down\`; moving the first step up or the last step down does nothing and is not an error. \`assignee: ""\` clears the assignee and logs \`step_unassigned\`. ${stepStatusRules}

Returns the installation populated for the caller's role. 404 \`Step not found\` for a bad step id.

${business400}`, {
      parameters: stepParams,
      requestBody: jsonBody('Any subset of these keys.', {
        type: 'object',
        properties: {
          ...stepWriteProps,
          status: { type: 'string', enum: STEP_STATUS, description: 'New status. `done` also needs `lat` and `lng`.' },
          move: { type: 'string', enum: ['up', 'down'] },
          message: str('Optional note stored on the status-change log, up to 1000 characters.'),
          lat: num('Required by the service when status becomes `done`. -90 to 90.'),
          lng: num('Required by the service when status becomes `done`. -180 to 180.'),
          imageUrl: str('Optional. The `url` returned by the photo route. Stored on the log only when status becomes `done`.'),
        },
      }, { status: 'done', message: 'Roof measured.', lat: 18.5204, lng: 73.8567, imageUrl: `/uploads/${ID.company}-step-ab12cd34ef567890.jpg` }),
      responses: done({ 200: okProject('The installation after the change.') }, 400, 401, 403, 404, 500),
    }),
    delete: operation('Projects', 'projectDeleteStep', 'Remove a step', `${tasksGate}

**Permission.** Installations › Delete.

**Behaviour.** Removes that step, logs \`step_removed\`, and returns the installation. 400 \`An installation needs at least one step\` when it is the only step. 404 \`Step not found\` for a bad id.`, {
      parameters: stepParams,
      responses: done({ 200: okProject('The installation without that step.') }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/steps/{stepId}/photo': {
    post: operation('Projects', 'projectUploadStepPhoto', 'Upload a step photo', `${tasksGate}

**Permission.** Installations › Update step status (\`tasks:change_status\`).

**Behaviour.** Stores one image and returns its path. It does not change the step and does not write a log. To show the photo on the timeline, send that \`url\` as \`imageUrl\` when you mark the step \`done\`.

**File.** Multipart field name \`file\`. One file. MIME \`image/png\`, \`image/jpeg\`, or \`image/webp\` (the server sniffs the bytes; a renamed file is rejected). Maximum 5 MB. Wrong type is 400 \`Upload a PNG, JPG or WebP image\` or \`That file is not a valid PNG, JPG or WebP image\`. No file is 400 \`Choose an image to upload\`. ${uploadLimitNote} ${protectedFileNote} Any non-client user of this company can open a step photo.

${business400}`, {
      parameters: stepParams,
      requestBody: fileBody('PNG, JPG, or WebP, up to 5 MB. Field name `file`.'),
      responses: done({
        201: json('The stored path. Send it as `imageUrl` on the status update.', { type: 'object', required: ['url'], properties: { url: str('`/uploads/<companyId>-step-<random>.<ext>`.') } }, { url: `/uploads/${ID.company}-step-ab12cd34ef567890.jpg` }),
      }, 400, 401, 403, 404, 429, 500),
    }),
  },

  '/api/projects/{id}/amc': {
    post: operation('Projects', 'projectCreateAmcVisit', 'Add an AMC visit to an installation', `${tasksGate}

**Permission.** Installations › Assign steps.

**Behaviour.** \`name\` must be an AMC template name (400 \`"<name>" is not an AMC package on your provider's schedule\` otherwise). A mandatory package is added directly; 400 \`"<name>" is already on this installation\` when that name is already there. An optional package is stored as a company booking on the proposal (\`requestedBy: "company"\`) and mirrored onto a visit, the same way a client booking is. \`date\` is required and is stored at local midnight; a date that does not parse is 400 \`Choose a valid date\`. Past dates are allowed on this company route. \`assigneeId\`, when sent, assigns that active agent in the same call (same errors as the assign route). 201 returns the new visit id, not the installation.

${business400}`, {
      parameters: idParams,
      requestBody: jsonBody('The visit to add.', {
        type: 'object',
        required: ['name', 'date'],
        properties: {
          name: str('Template name, up to 80 characters.'),
          date: str('A date the server can parse. Required.'),
          note: str('Up to 500 characters.'),
          assigneeId: str('Optional staff id, or empty to leave it unassigned.'),
        },
      }, { name: 'Panel cleaning', date: '2026-04-10', note: 'Called the office.', assigneeId: ID.staff }),
      responses: done({
        201: json('The visit was added.', { type: 'object', required: ['ok', 'visitId'], properties: { ok: bool('True.'), visitId: idProp('New visit id.') } }, { ok: true, visitId: ID.visit }),
      }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/amc/{visitId}': {
    put: operation('Projects', 'projectCompleteAmcVisit', 'Complete an AMC visit', `${tasksGate}

**Permission.** Installations › Update step status (\`tasks:change_status\`). The 403 names that permission: \`You need the “Installations › Update step status” permission. Ask your company admin.\`

**Behaviour.** Ticks the checklist and marks the visit \`completed\` (\`status\` and \`workflowStatus\`). Every criterion must end checked, or the response is 400 \`Check all criteria before completing (<n> remaining)\`. An unknown criterion id is 400 \`Unknown checklist item\`. Already completed is 400 \`This AMC visit is already completed\`. When the installation is not yet \`completed\`, the visit's \`workflowStatus\` must already be \`assigned\`, or the response is 400 \`Assign staff to this AMC visit first, or complete the installation.\` A completed installation can be closed without an assignee. The matching client booking, if any, is set to \`completed\`. Returns the installation.

${business400}`, {
      parameters: visitParams,
      requestBody: jsonBody('Checklist ticks and an optional note. Omit `criteria` only when the visit has no checklist.', {
        type: 'object',
        properties: {
          note: str('Up to 1000 characters. Stored as `completionNote`.'),
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id'],
              properties: {
                id: idProp('Criterion id from the visit.'),
                checked: bool('Tick. Omitted leaves the current value.'),
                note: str('Up to 300 characters.'),
              },
            },
          },
        },
      }, { note: 'Modules cleaned, inverter alarms clear.', criteria: [{ id: ID.criterion, checked: true, note: '' }] }),
      responses: done({ 200: okProject('The installation with that visit completed.') }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/amc/{visitId}/assign': {
    put: operation('Projects', 'projectAssignAmcVisit', 'Assign or reassign an AMC visit', `${tasksGate}

**Permission.** Installations › Assign steps.

**Behaviour.** Puts an active agent on the visit and, when the visit carries a booking, sets that booking to \`assigned\` too. Replacing someone increments \`reassignedCount\` and appends \`previousAssignees\`. Assigning the person who already holds it does not count as a reassignment and still returns \`{ "ok": true }\`. 400 \`This AMC visit is already completed\` when the field work is done. 400 \`This visit has no date yet\` for an optional visit that has no \`clientRequestedDate\`. 400 \`Choose an active staff member\` when the user is missing, inactive, or not an agent. Returns \`{ "ok": true }\`, not the installation.

${business400}`, {
      parameters: visitParams,
      requestBody: jsonBody('The staff member.', { type: 'object', required: ['assigneeId'], properties: { assigneeId: idProp('Active agent id.') } }, { assigneeId: ID.staff }),
      responses: done({ 200: json('Assigned.', { type: 'object', required: ['ok'], properties: { ok: bool('True.') } }, { ok: true }) }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/projects/{id}/amc/{visitId}/invoice': {
    get: operation('Projects', 'projectGetAmcPartsInvoice', 'Get the parts invoice for an AMC visit', `${tasksGate}

**Permission.** Installations › Invoice parts used on AMC visits (\`tasks:invoice_parts\`).

**Behaviour.** The invoice, the client it is addressed to, the proposal name, and the parts copied onto the visit. 404 \`Parts invoice not found\` when this visit has not been invoiced, or the invoice row is gone. Opening the archived PDF is a protected invoice file and the file gate checks Finances › View, which is separate from this permission.`, {
      parameters: visitParams,
      responses: done({ 200: json('Invoice view for the PDF screen.', amcInvoiceView, amcInvoiceExample) }, 401, 403, 404, 500),
    }),
    post: operation('Projects', 'projectInvoiceAmcParts', 'Invoice parts used on an AMC visit', `${tasksGate}

**Permission.** Installations › Invoice parts used on AMC visits.

**Behaviour.** Takes the parts out of stock and issues one \`amc_parts\` invoice on the proposal, then stores \`parts\`, \`partsInvoice\`, and \`partsInvoiceNo\` on the visit. 409 \`The parts for this visit were already invoiced (<invoice no>)\` when it was billed before, or \`The parts for this visit were just invoiced. Refresh to see the invoice.\` on a race. 404 \`Product not found\` or \`Proposal not found\` or \`Batch not found\`. 400 \`"<product>" is inactive and can't be sold or billed\`, \`Choose the base, wholesale or retail price for <product>\`, \`Enter the quantity of <product>\`, or \`Choose the serial numbers of <product>\`. 409 when the batch or the serials are no longer in stock (\`Only <n> <unit> of <product> in stock\`, or \`Not in stock: <serials>\`). 400 \`Invoice total must be greater than zero\` when the rates sum to nothing. GST is added on top of the batch rate unless \`withGst\` is false.

${business400}`, {
      parameters: visitParams,
      requestBody: jsonBody('Stock lines to bill.', partsInvoiceBody, { lines: [{ productId: ID.template, qty: 1, batch: '', priceType: 'retail' }], withGst: true, note: 'Replaced the DC MCB.' }),
      responses: done({ 201: json('The new invoice view. `visit.parts` is filled.', amcInvoiceView, amcInvoiceExample) }, 400, 401, 403, 404, 409, 500),
    }),
  },

  '/api/projects/{id}/amc/{visitId}/invoice/pdf': {
    post: operation('Projects', 'projectAttachAmcPartsInvoicePdf', 'Archive the AMC parts invoice PDF', `${tasksGate}

**Permission.** Installations › Invoice parts used on AMC visits.

**Behaviour.** Attaches the PDF the browser generated. The visit must already have a parts invoice (404 \`Parts invoice not found\` otherwise). A second upload is 409 \`This invoice already has its PDF archived. Issued documents can't be replaced.\` and the new file is discarded. The response is \`{ ok: true, pdfName }\`. \`pdfName\` is the stored filename, not a URL. ${protectedFileNote} The file gate for this PDF checks Finances › View.

**File.** Multipart field name \`file\`. One file. MIME \`application/pdf\` only. Maximum 20 MB. Wrong type is 400 \`Upload a PDF\` or \`That file is not a valid PNG, JPG, WebP image or PDF\`. No file is 400 \`Upload a PDF\`. ${uploadLimitNote}

${business400}`, {
      parameters: visitParams,
      requestBody: fileBody('PDF only, up to 20 MB. Field name `file`.'),
      responses: done({
        201: json('PDF stored once.', { type: 'object', required: ['ok', 'pdfName'], properties: { ok: bool('True.'), pdfName: str('Filename only, `<companyId>-invoice-<projectId>-<random>.pdf`.') } }, { ok: true, pdfName: `${ID.company}-invoice-${ID.project}-ab12cd34ef567890.pdf` }),
      }, 400, 401, 403, 404, 409, 429, 500),
    }),
  },

  '/api/my/projects': {
    get: operation('Projects', 'myProjectList', 'List installations assigned to me', `${myGate}

**Behaviour.** JSON array, not a page. Includes a job when the signed-in agent is assignee of a step or of an AMC visit, including completed jobs. \`logs\` is absent. Sorted by \`updatedAt\` descending. Field view of proposal and client, as described above. No query parameters.`, {
      responses: done({ 200: json('Assigned installations, field view, without logs.', { type: 'array', items: projectSchema }, [listedProject(fieldProjectExample)]) }, 401, 403, 500),
    }),
  },

  '/api/my/projects/amc-overview': {
    get: operation('Projects', 'myProjectAmcOverview', 'My AMC tracker', `${myGate}

**Behaviour.** Same row shape as \`GET /api/projects/amc-overview\`, but the rows are completed installations where this agent holds a step, plus any installation (completed or not) where an AMC visit is assigned to them. Same query filters.`, {
      parameters: amcOverviewQuery,
      responses: done({ 200: json('This agent\'s tracker rows.', amcOverviewSchema, amcOverviewExample) }, 401, 403, 500),
    }),
  },

  '/api/my/projects/amc-visits': {
    get: operation('Projects', 'myProjectAmcVisits', 'AMC visits assigned to me', `${myGate}

**Behaviour.** Same row shape as the company visit list, but only visits whose assignee is the signed-in agent. No placeholders for bookings that have no installation. Other visits on the same job are not included; open the installation to see those.`, {
      responses: done({ 200: json('Visits assigned to this agent.', amcVisitsSchema, { items: [{ ...amcVisitRowExample, assignee: { id: ID.staff, name: 'Ravi Kumar' } }], total: 1, amcNames: ['1st service'], amcTemplates: [{ name: '1st service', kind: 'mandatory' }] }) }, 401, 403, 500),
    }),
  },

  '/api/my/projects/board': {
    get: operation('Projects', 'myProjectBoard', 'My installation Kanban', `${myGate}

**Behaviour.** Same column shape as \`GET /api/projects/board\`. Cards are installations where this agent is the assignee of at least one step (an AMC-only assignment does not put the job on this board). \`mine\` is true only on steps assigned to this agent; those are the steps \`PUT /api/my/projects/{id}/steps/{stepId}\` will accept. No query.`, {
      responses: done({ 200: json('Columns for this agent\'s steps.', boardSchema, boardExample) }, 401, 403, 500),
    }),
  },

  '/api/my/projects/{id}/lifecycle': {
    get: operation('Projects', 'myProjectLifecycle', 'My timeline for one assigned installation', `${myGate}

**Behaviour.** 404 unless this agent holds a step or an AMC visit on the installation. The timeline is installation events only (no client history, no proposal history, no prices, no client phone or email). Proposal is \`{ id, name, status }\`. Client is \`{ name }\` or null.`, {
      parameters: idParams,
      responses: done({
        200: json('Field timeline.', {
          type: 'object',
          properties: {
            design: { type: 'object', properties: { id: idProp('Proposal id.'), name: str('Name.'), status: { type: 'string', enum: DESIGN_STATUS } } },
            client: { type: 'object', nullable: true, properties: { name: str('Client name only.') } },
            installation: { type: 'object', nullable: true, properties: { id: idProp('Installation id.'), status: { type: 'string', enum: PROJECT_STATUS }, startedAt: dateTime('Installation createdAt.') } },
            events: { type: 'array', items: lifecycleEvent, description: '`phase` is `installation` on every row.' },
          },
        }, {
          design: { id: ID.design, name: 'Sharma rooftop 5 kW', status: 'won' },
          client: { name: 'A. Sharma' },
          installation: { id: ID.project, status: 'active', startedAt: WHEN },
          events: [{ id: 'p-0', at: WHEN, action: 'started', phase: 'installation', stepName: '', byName: 'Ravi Kumar', byRole: 'agent', message: '', lat: null, lng: null, imageUrl: '' }],
        }),
      }, 401, 403, 404, 500),
    }),
  },

  '/api/my/projects/{id}': {
    get: operation('Projects', 'myProjectGet', 'Get one installation assigned to me', `${myGate}

**Behaviour.** Field view, including \`logs\` and every step and visit on the job (not only the ones assigned to this agent). 404 when this agent holds neither a step nor a visit. A completed installation may gain new mandatory AMC visits before the response, same as the company GET.`, {
      parameters: idParams,
      responses: done({ 200: okProject('The installation, field view.', fieldProjectExample) }, 401, 403, 404, 500),
    }),
  },

  '/api/my/projects/{id}/notes': {
    post: operation('Projects', 'myProjectAddNote', 'Add a note on an installation assigned to me', `${myGate}

**Behaviour.** Same body as \`POST /api/projects/{id}/notes\`. The agent must hold a step or a visit on the job. Returns the installation in the field view. 201.`, {
      parameters: idParams,
      requestBody: noteBody,
      responses: done({ 201: okProject('The installation, field view, with the note.', fieldProjectExample) }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/my/projects/{id}/steps/{stepId}': {
    put: operation('Projects', 'myProjectSetStepStatus', 'Update the status of my step', `${myGate}

**Behaviour.** The only step write on the staff routes. \`status\` is required. The step's assignee must be this user, or the response is 403 \`This step is assigned to someone else\`. Name, role, priority, order, and assignee cannot be changed here. ${stepStatusRules}

Returns the installation in the field view.

${business400}`, {
      parameters: stepParams,
      requestBody: jsonBody('Status, and coordinates when marking done.', {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: STEP_STATUS },
          message: str('Optional log note, up to 1000 characters.'),
          lat: num('Required when status is `done`.'),
          lng: num('Required when status is `done`.'),
          imageUrl: str('Optional photo `url` from the upload route. Kept on the log only when the new status is `done`.'),
        },
      }, { status: 'done', message: 'Inspection done.', lat: 18.5204, lng: 73.8567, imageUrl: `/uploads/${ID.company}-step-ab12cd34ef567890.jpg` }),
      responses: done({ 200: okProject('The installation, field view.', fieldProjectExample) }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/my/projects/{id}/steps/{stepId}/photo': {
    post: operation('Projects', 'myProjectUploadStepPhoto', 'Upload a photo on a step of my installation', `${myGate}

**Behaviour.** Same file rules and same \`{ url }\` response as \`POST /api/projects/{id}/steps/{stepId}/photo\`. The agent must hold some step or visit on the installation. The photo route does not check that this particular step is assigned to them (the status update does). It still does not attach the photo; send \`url\` as \`imageUrl\` when marking the step done.

**File.** Field name \`file\`. PNG, JPG, or WebP. Maximum 5 MB. ${uploadLimitNote} ${protectedFileNote}`, {
      parameters: stepParams,
      requestBody: fileBody('PNG, JPG, or WebP, up to 5 MB. Field name `file`.'),
      responses: done({
        201: json('Stored path.', { type: 'object', required: ['url'], properties: { url: str('`/uploads/<companyId>-step-<random>.<ext>`.') } }, { url: `/uploads/${ID.company}-step-ab12cd34ef567890.jpg` }),
      }, 400, 401, 403, 404, 429, 500),
    }),
  },

  '/api/my/projects/{id}/amc/{visitId}': {
    put: operation('Projects', 'myProjectCompleteAmcVisit', 'Complete an AMC visit assigned to me', `${myGate}

**Behaviour.** Same body and checklist rules as \`PUT /api/projects/{id}/amc/{visitId}\`. The visit's assignee must be this user, or the response is 403 \`This AMC visit is not assigned to you\`. There is no extra "installation must be completed" check on the staff route. Returns the installation in the field view.

${business400}`, {
      parameters: visitParams,
      requestBody: jsonBody('Checklist and optional note.', {
        type: 'object',
        properties: {
          note: str('Up to 1000 characters.'),
          criteria: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: idProp('Criterion id.'), checked: bool('Tick.'), note: str('Up to 300 characters.') } } },
        },
      }, { note: 'Done.', criteria: [{ id: ID.criterion, checked: true }] }),
      responses: done({ 200: okProject('The installation, field view.', fieldProjectExample) }, 400, 401, 403, 404, 500),
    }),
  },

  '/api/my/projects/{id}/amc/{visitId}/invoice': {
    get: operation('Projects', 'myProjectGetAmcPartsInvoice', 'Get the parts invoice for my AMC visit', `${myGate}

**Permission.** Installations › Invoice parts used on AMC visits, in addition to being an agent.

**Behaviour.** Same view as the company GET. The visit must be assigned to this agent (403 \`This AMC visit is not assigned to you\` otherwise) and the agent must hold a step or a visit on the installation. 404 \`Parts invoice not found\` when nothing has been billed.`, {
      parameters: visitParams,
      responses: done({ 200: json('Invoice view.', amcInvoiceView, amcInvoiceExample) }, 401, 403, 404, 500),
    }),
    post: operation('Projects', 'myProjectInvoiceAmcParts', 'Invoice parts on an AMC visit assigned to me', `${myGate}

**Permission.** Installations › Invoice parts used on AMC visits.

**Behaviour.** Same body, stock rules, and 201 view as \`POST /api/projects/{id}/amc/{visitId}/invoice\`. The visit must be assigned to this agent.

${business400}`, {
      parameters: visitParams,
      requestBody: jsonBody('Stock lines to bill.', partsInvoiceBody, { lines: [{ productId: ID.template, qty: 1, priceType: 'retail' }], withGst: true }),
      responses: done({ 201: json('The new invoice view.', amcInvoiceView, amcInvoiceExample) }, 400, 401, 403, 404, 409, 500),
    }),
  },

  '/api/my/projects/{id}/amc/{visitId}/invoice/pdf': {
    post: operation('Projects', 'myProjectAttachAmcPartsInvoicePdf', 'Archive the parts-invoice PDF for my visit', `${myGate}

**Permission.** Installations › Invoice parts used on AMC visits.

**Behaviour.** Same file rules and \`{ ok, pdfName }\` response as the company PDF route. The visit must be assigned to this agent, and a parts invoice must already exist.

**File.** Field name \`file\`. \`application/pdf\`. Maximum 20 MB. ${uploadLimitNote} ${protectedFileNote}`, {
      parameters: visitParams,
      requestBody: fileBody('PDF only, up to 20 MB. Field name `file`.'),
      responses: done({
        201: json('PDF stored once.', { type: 'object', required: ['ok', 'pdfName'], properties: { ok: bool('True.'), pdfName: str('Filename only.') } }, { ok: true, pdfName: `${ID.company}-invoice-${ID.project}-ab12cd34ef567890.pdf` }),
      }, 400, 401, 403, 404, 409, 429, 500),
    }),
  },

  '/api/my/counts': {
    get: operation('Projects', 'myProjectCounts', 'Sidebar counts for the signed-in staff member', `${myGate}

Defined on the API index, not on the project router. Calls \`staffCounts\`.

**Behaviour.** Numbers for the staff sidebar. \`myTasks\` and \`amc\` are always present. Every other key is present only when this agent has **View** on that area. A missing key means "hide that item", not zero.

- \`myTasks\`: installations that have a step assigned to this user whose status is not \`done\`. Count of installations, not of steps.
- \`amc\`: visits assigned to this user that are not \`completed\` and whose \`workflowStatus\` is not \`cancelled\`.
- \`metaLeads\`, \`googleLeads\`, \`manualLeads\`, and \`leads\` (the sum): only with Leads › View. Leads assigned to this user, unless they have Leads › View all (then every live lead in the branch) or Leads › Their team's leads (then the team). Meta counts only \`processingStatus: "processed"\` and not deleted. Google and manual count not-deleted leads.
- \`clients\`: every client in the branch, with Clients › View. Not limited to the team.
- \`designs\` and \`estimates\`: every proposal and saved estimate in the branch, with Proposals › View.
- \`loans\` and \`subsidies\`: files still \`in_progress\`, with that area's View.
- \`expenses\`: proposals that are won or that have an expense or a budget, capped at 1000, with Expenses › View.
- \`billing\`: parties (a won proposal, or a client billed with no proposal) whose billed total is still greater than payments received, with Finances › View.
- \`installations\`: every \`active\` installation in the branch, with Installations › View. This is not \`myTasks\`.
- \`clientSupport\`: client-help tickets \`open\` or \`in_progress\`, with Client support › View.
- \`support\`: the company's tickets with the platform that are \`open\` or \`in_progress\`, with Platform support › View.
- \`packages\`, \`products\`, \`suppliers\`: with Inventory › View. Products are the shared catalog.`, {
      responses: done({
        200: json('Whichever keys this agent may see. The example is an agent who can view leads, installations, loans, and subsidies.', {
          type: 'object',
          description: 'Only `myTasks` and `amc` are guaranteed. Other properties are omitted without that area\'s View permission.',
          properties: {
            myTasks: { type: 'integer', description: 'Installations with one of my steps still not done.' },
            amc: { type: 'integer', description: 'My open AMC visits.' },
            metaLeads: { type: 'integer' },
            googleLeads: { type: 'integer' },
            manualLeads: { type: 'integer' },
            leads: { type: 'integer', description: 'Sum of the three lead counts. Present only together with them.' },
            clients: { type: 'integer' },
            designs: { type: 'integer' },
            estimates: { type: 'integer' },
            loans: { type: 'integer', description: 'In-progress loan files.' },
            subsidies: { type: 'integer', description: 'In-progress subsidy files.' },
            expenses: { type: 'integer' },
            billing: { type: 'integer', description: 'Parties who still owe money.' },
            installations: { type: 'integer', description: 'Active installations in the whole branch.' },
            clientSupport: { type: 'integer' },
            support: { type: 'integer' },
            packages: { type: 'integer' },
            products: { type: 'integer' },
            suppliers: { type: 'integer' },
          },
        }, { myTasks: 3, amc: 1, metaLeads: 4, googleLeads: 2, manualLeads: 1, leads: 7, loans: 2, subsidies: 1, installations: 6 }),
      }, 401, 403, 500),
    }),
  },
};

const docFileNote = 'Multipart field name is `file` (one file). Allowed types, checked from the bytes and the file name: PDF (`application/pdf`), PNG (`image/png`), JPG (`image/jpeg`), WebP (`image/webp`), XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), XLS (`application/vnd.ms-excel`). The name must end in pdf, png, jpg, jpeg, webp, xlsx, or xls. Maximum 20 MB. A wrong type is 400 `Upload a PDF, a PNG / JPG / WebP image or an Excel file (XLSX, XLS)` or `That file is not a valid PDF, PNG, JPG, WebP image or Excel file`. No file is 400 `Choose a file to upload`. ' + uploadLimitNote;

const fileTemplateStep = {
  type: 'object',
  properties: {
    id: idProp('Template row id. Replacing the template gives every row a new id. Files already open keep the steps they copied.'),
    name: str('Up to 80 characters.'),
    description: str('Up to 400 characters. Stored as empty when omitted.'),
  },
};

const fileDocument = {
  type: 'object',
  properties: {
    id: idProp('Document id. Send this as `docId`.'),
    name: str('Display name, up to 200 characters. Starts as the uploaded file name, or `Document` when the upload has none.'),
    url: str('`/uploads/<companyId>-<loandoc|subsidydoc>-<fileId>-<random>.<ext>`. Protected. Ask `GET /api/files/link?url=` for a signed link. Loans need Loans › View; subsidies need Subsidies › View.'),
    size: num('Bytes.'),
    byName: str('Name of the user who uploaded it, or their email.'),
    uploadedAt: dateTime('When it was stored.'),
  },
};

const fileStep = {
  type: 'object',
  properties: {
    id: idProp('Step id.'),
    name: str('Copied from the template. Up to 80 characters.'),
    description: str('Copied from the template. Up to 400 characters.'),
    status: { type: 'string', enum: STEP_STATUS, description: '`pending`, `in_progress`, or `done`. The file steps use STEP_STATUS, not the file status.' },
    remark: str('Shown to the client. Up to 500 characters. Private notes on the file itself are `notes`, not this.'),
    completedAt: dateTime('Set when this step becomes `done`. Cleared when it leaves `done`.', { nullable: true }),
    documents: { type: 'array', items: fileDocument, description: 'Up to 20 files. The client portal does not receive this array.' },
  },
};

const designBrief = {
  type: 'object',
  description: 'Proposal populated on list, get, update, and document routes. On `GET /proposal/{designId}` this field is the id string instead, because that read does not populate.',
  properties: {
    id: idProp('Proposal id.'),
    name: str('Proposal name.'),
    type: { type: 'string', enum: ['3d', 'quick'], description: '`3d` is a designed proposal. `quick` is products and packages only.' },
    status: { type: 'string', enum: DESIGN_STATUS },
    summary: { type: 'object', properties: { kwp: num('System size.'), address: str('Site address.') } },
  },
};

const clientBrief = {
  type: 'object',
  description: 'Client populated on list, get, update, and document routes. On `GET /proposal/{designId}` this field is the id string instead.',
  properties: {
    id: idProp('Client id.'),
    name: str('Name.'),
    email: str('Email.'),
    phone: str('Phone.'),
    address: str('Address.'),
  },
};

const stepLogActions = '`opened` (written when the file was created, which these routes do not do), `status_changed` (message is the new file status), `step_pending`, `step_in_progress`, `step_done`, `document_added`, `document_renamed` (message is `old → new`), `document_removed`, `steps_added` (message is the new step names, comma-separated).';

function moneyPaths(cfg) {
  const gate = `**Who.** Bearer token. Mounted at \`${cfg.base}\` behind \`withAreaAccess('${cfg.area}')\`. A branch owner or company admin passes every ${cfg.areaLabel} permission check. Staff need at least one ${cfg.areaLabel} permission to reach the router (otherwise 403 \`You don't have access to ${cfg.areaLabel}. Ask your company admin.\`) and the permission named on the route.

**There is no create route.** A ${cfg.noun} file is opened when the proposal is saved with ${cfg.openedBy}. Until then \`GET ${cfg.base}/proposal/{designId}\` is JSON \`null\`. These routes list and update files that already exist.

**Reads.** \`GET ${cfg.base}\` and \`GET ${cfg.base}/{id}\` populate \`client\` (\`name\`, \`email\`, \`phone\`, \`address\`) and \`design\` (\`name\`, \`type\`, \`status\`, \`summary.kwp\`, \`summary.address\`). The list omits \`logs\` and is capped at 1000 rows, newest \`updatedAt\` first, with no page. \`GET ${cfg.base}/proposal/{designId}\` also omits \`logs\` and does **not** populate: \`client\` and \`design\` are id strings. \`GET ${cfg.base}/{id}\`, updates, documents, and sync include \`logs\`. ${stepLogActions}`;

  const record = {
    type: 'object',
    properties: {
      id: idProp(`${cfg.Noun} id.`),
      company: idProp('Branch id.'),
      design: designBrief,
      client: clientBrief,
      status: { type: 'string', enum: cfg.statusEnum, description: cfg.statusHelp },
      ...cfg.fields,
      notes: str('Private to the company. The client portal never receives this. Up to 1000 characters.'),
      steps: { type: 'array', items: fileStep },
      logs: { type: 'array', items: activityLog, description: 'Present on get, update, documents, and sync. Omitted on the list and on GET by proposal. ' + stepLogActions },
      createdAt: dateTime('When the file was opened.'),
      updatedAt: dateTime('Last save. A PUT that changes nothing still saves, so this moves.'),
    },
  };
  const detailExample = cfg.detail;
  const listRow = { ...detailExample };
  delete listRow.logs;
  const bareExample = { ...listRow, design: ID.design, client: ID.client };
  const { logs: _logs, ...bareProps } = record.properties;
  const bare = {
    type: 'object',
    nullable: true,
    description: `The ${cfg.noun}, or JSON null. On this route \`design\` and \`client\` are id strings and \`logs\` is absent.`,
    properties: {
      ...bareProps,
      design: idProp('Proposal id. This route does not populate.'),
      client: idProp('Client id. This route does not populate.'),
    },
  };

  const stepParams = [
    pathParam('id', `${cfg.Noun} id. A malformed id is 404 \`${cfg.Noun} not found\`.`),
    pathParam('stepId', 'Step id. A malformed or unknown id is 404 `Step not found`.'),
  ];
  const docParams = [...stepParams, pathParam('docId', 'Document id. Unknown is 404 `Document not found`.')];

  const op = (suffix, summary, description, opts) => operation(cfg.tag, cfg.prefix + suffix, summary, description, opts);

  return {
    [`${cfg.base}/steps`]: {
      get: op('ListSteps', `List the ${cfg.noun} step template`, `${gate}

**Permission.** ${cfg.viewPerm}.

**Behaviour.** The template copied onto each new ${cfg.noun}. ${cfg.templateDefault} Running files are not changed when this list changes.`, {
        responses: done({ 200: json('Template rows.', { type: 'array', items: fileTemplateStep }, cfg.templateExample) }, 401, 403, 500),
      }),
      put: op('UpdateSteps', `Replace the ${cfg.noun} step template`, `${gate}

**Permission.** Masters, not the ${cfg.areaLabel} update permission. Only a company admin, or the branch owner when the organization has no branches. Anyone else is 403 \`Only your company admin can change these settings.\`

**Behaviour.** Replaces the whole template (at most 30 steps). Each \`name\` is required (up to 80 characters). \`description\` is optional (up to 400, stored as \`""\` when omitted). Returns the saved rows with new ids. Files already open keep their steps; use sync-steps to append template names they do not have yet.

${business400}`, {
        requestBody: jsonBody('The whole template.', {
          type: 'object',
          required: ['steps'],
          properties: {
            steps: { type: 'array', maxItems: 30, items: { type: 'object', required: ['name'], properties: { name: str('Required, up to 80 characters.'), description: str('Up to 400 characters.') } } },
          },
        }, { steps: cfg.templateInput }),
        responses: done({ 200: json('The saved template.', { type: 'array', items: fileTemplateStep }, cfg.templateExample) }, 400, 401, 403, 500),
      }),
    },
    [cfg.base]: {
      get: op('List', `List ${cfg.noun} files`, `${gate}

**Permission.** ${cfg.viewPerm}.

**Behaviour.** Up to 1000 ${cfg.noun} files. \`q\` matches ${cfg.search}, case-insensitive, first 100 characters. \`status\` omitted or \`all\` does not filter. Any other string is matched as stored, so a value outside ${cfg.statusEnum.join(', ')} returns an empty array and is not a 400.`, {
        parameters: [
          queryParam('q', cfg.search, { type: 'string' }),
          queryParam('status', `One of ${cfg.statusEnum.join(', ')}, or \`all\`.`, { type: 'string', enum: [...cfg.statusEnum, 'all'] }),
        ],
        responses: done({ 200: json(`Newest ${cfg.noun} files, without logs.`, { type: 'array', items: record }, [listRow]) }, 401, 403, 500),
      }),
    },
    [`${cfg.base}/proposal/{designId}`]: {
      get: op('GetByDesign', `Get the ${cfg.noun} for one proposal`, `${gate}

**Permission.** ${cfg.viewPerm}.

**Behaviour.** 200 with the ${cfg.noun}, or 200 with JSON \`null\` when that proposal has no ${cfg.noun} file. A well-formed id that is not a proposal in this company is also \`null\` — this route does not check that the proposal exists. An id that is not 24 hex characters is 404 \`Proposal not found\`. \`logs\` is omitted. \`design\` and \`client\` are id strings, not objects. Use \`GET ${cfg.base}/{id}\` for the populated file and the log.`, {
        parameters: [pathParam('designId', 'Proposal id.')],
        responses: done({
          200: jsonExamples(`The ${cfg.noun}, or null.`, bare, {
            none: { summary: `No ${cfg.noun} file`, value: null },
            found: { summary: 'File, unpopulated, no logs', value: bareExample },
          }),
        }, 401, 403, 404, 500),
      }),
    },
    [`${cfg.base}/{id}`]: {
      get: op('Get', `Get one ${cfg.noun} file`, `${gate}

**Permission.** ${cfg.viewPerm}.

**Behaviour.** The file with populated client and proposal, steps, documents, and logs. 404 \`${cfg.Noun} not found\` when the id is missing or malformed.`, {
        parameters: [pathParam('id', `${cfg.Noun} id.`)],
        responses: done({ 200: json(`The ${cfg.noun} file.`, record, detailExample) }, 401, 403, 404, 500),
      }),
      put: op('Update', `Update ${cfg.noun} details and status`, `${gate}

**Permission.** ${cfg.updatePerm}.

**Behaviour.** Partial update: omit a key to leave it. Send \`""\` to clear a text field. Send \`null\` to clear a number or a date. A date that does not parse is stored as null and is not a 400. ${cfg.updateHelp} Changing \`status\` to a different value appends \`status_changed\`. Saving always runs, so \`updatedAt\` changes even when no field changed. Returns the populated file including logs.

${business400}`, {
        parameters: [pathParam('id', `${cfg.Noun} id.`)],
        requestBody: jsonBody('Any subset of these fields.', { type: 'object', properties: { status: { type: 'string', enum: cfg.statusEnum }, ...cfg.updateProps, notes: str('Up to 1000 characters.') } }, cfg.updateExample),
        responses: done({ 200: json(`The updated ${cfg.noun}.`, record, detailExample) }, 400, 401, 403, 404, 500),
      }),
    },
    [`${cfg.base}/{id}/steps/{stepId}`]: {
      put: op('UpdateStep', `Update one ${cfg.noun} step`, `${gate}

**Permission.** ${cfg.updatePerm}.

**Behaviour.** Sets \`remark\` and/or \`status\` (\`pending\`, \`in_progress\`, \`done\`). Omit a key to leave it. \`done\` sets \`completedAt\`; any other status clears it. The log action is \`step_<status>\` (\`step_pending\`, \`step_in_progress\`, \`step_done\`). When every step is \`done\` and the file is \`in_progress\`, the file becomes \`completed\`. When a step leaves \`done\` and the file was \`completed\`, the file returns to \`in_progress\`. A file that is \`rejected\` stays \`rejected\` when steps change. Returns the populated file.

${business400}`, {
        parameters: stepParams,
        requestBody: jsonBody('Status, remark, or both.', {
          type: 'object',
          properties: {
            status: { type: 'string', enum: STEP_STATUS },
            remark: str('Up to 500 characters. This is what the client sees on the step.'),
          },
        }, { status: 'done', remark: 'Received.' }),
        responses: done({ 200: json(`The ${cfg.noun} after the step change.`, record, detailExample) }, 400, 401, 403, 404, 500),
      }),
    },
    [`${cfg.base}/{id}/steps/{stepId}/documents`]: {
      post: op('AddDocument', `Upload a document onto a ${cfg.noun} step`, `${gate}

**Permission.** ${cfg.updatePerm}.

**Behaviour.** Stores the file on that step and returns the whole ${cfg.noun} (201), including the new document and a \`document_added\` log. The stored name is the original file name, trimmed to 200 characters, or \`Document\`. At most 20 documents on a step (400 \`A step can keep up to 20 documents. Remove one first\`). If saving fails, the stored file is deleted. ${docFileNote} ${protectedFileNote}

${business400}`, {
        parameters: stepParams,
        requestBody: fileBody(docFileNote),
        responses: done({ 201: json(`The ${cfg.noun}, with the new document on the step.`, record, detailExample) }, 400, 401, 403, 404, 429, 500),
      }),
    },
    [`${cfg.base}/{id}/steps/{stepId}/documents/{docId}`]: {
      put: op('RenameDocument', `Rename a ${cfg.noun} step document`, `${gate}

**Permission.** ${cfg.updatePerm}.

**Behaviour.** \`name\` is required, up to 200 characters. The stored file's extension is kept: if the new name does not already end with that extension, it is appended (and the name is shortened so the total stays within 200). An unchanged name does not write a log. A change logs \`document_renamed\`. Returns the populated ${cfg.noun}.

${business400}`, {
        parameters: docParams,
        requestBody: jsonBody('The new display name.', { type: 'object', required: ['name'], properties: { name: str('Required, up to 200 characters.') } }, { name: 'Aadhaar' }),
        responses: done({ 200: json(`The ${cfg.noun} after the rename.`, record, detailExample) }, 400, 401, 403, 404, 500),
      }),
      delete: op('DeleteDocument', `Remove a ${cfg.noun} step document`, `${gate}

**Permission.** ${cfg.updatePerm}.

**Behaviour.** Removes the document row, deletes the stored file, logs \`document_removed\`, and returns the ${cfg.noun} (200, not \`{ ok: true }\`). 404 \`Document not found\` when the id is not on that step.`, {
        parameters: docParams,
        responses: done({ 200: json(`The ${cfg.noun} without that document.`, record, detailExample) }, 401, 403, 404, 500),
      }),
    },
    [`${cfg.base}/{id}/sync-steps`]: {
      post: op('SyncSteps', `Add missing template steps to this ${cfg.noun}`, `${gate}

**Permission.** ${cfg.updatePerm}.

**Behaviour.** No body. Appends template steps whose names are not already on this file (comparison is case-insensitive). It does not remove, rename, or reorder steps the file already has, and it does not refresh their descriptions. 400 \`${cfg.syncEmpty}\` when nothing is missing. If the file was \`completed\`, it returns to \`in_progress\`. Logs \`steps_added\`. Returns the populated file.`, {
        parameters: [pathParam('id', `${cfg.Noun} id.`)],
        responses: done({ 200: json(`The ${cfg.noun} with the new steps appended.`, record, detailExample) }, 400, 401, 403, 404, 500),
      }),
    },
  };
}

const loanDocumentExample = {
  id: ID.doc,
  name: 'aadhaar.pdf',
  url: `/uploads/${ID.company}-loandoc-${ID.loan}-ab12cd34.pdf`,
  size: 120000,
  byName: 'Ravi Kumar',
  uploadedAt: WHEN,
};

const loanDetail = {
  id: ID.loan,
  company: ID.company,
  design: { id: ID.design, name: 'Sharma rooftop 5 kW', type: '3d', status: 'won', summary: { kwp: 5, address: '12 MG Road, Pune' } },
  client: { id: ID.client, name: 'A. Sharma', email: 'sharma@example.com', phone: '9876543210', address: '12 MG Road, Pune' },
  status: 'in_progress',
  lender: 'State Bank',
  branch: 'Pune Camp',
  ifsc: 'SBIN0001234',
  accountRef: 'HL-2026-014',
  amount: 200000,
  interestRate: 9.5,
  tenureMonths: 60,
  emi: 4200,
  downPayment: 80000,
  processingFee: 2000,
  sanctionedOn: '2026-03-01T00:00:00.000Z',
  disbursedOn: null,
  notes: 'Waiting on the sanction letter.',
  steps: [{
    id: ID.step,
    name: 'Documents collected',
    description: 'ID proof, address proof, income proof, electricity bill and bank statements.',
    status: 'done',
    remark: 'Aadhaar and the electricity bill are in.',
    completedAt: WHEN,
    documents: [loanDocumentExample],
  }],
  logs: [{
    id: ID.log, at: WHEN, action: 'document_added', step: null, stepName: 'Documents collected',
    by: ID.staff, byName: 'Ravi Kumar', byRole: 'agent', message: 'aadhaar.pdf', lat: null, lng: null, imageUrl: '',
  }],
  createdAt: WHEN,
  updatedAt: WHEN,
};

const subsidyDetail = {
  id: ID.subsidy,
  company: ID.company,
  design: loanDetail.design,
  client: loanDetail.client,
  status: 'in_progress',
  scheme: 'PM Surya Ghar',
  applicationNo: 'PSG-1001',
  consumerNo: '334455',
  discom: 'MSEDCL',
  centralAmount: 78000,
  stateAmount: 0,
  receivedAmount: null,
  approvedOn: null,
  creditedOn: null,
  notes: '',
  steps: [{
    id: ID.step2,
    name: 'Documents collected',
    description: 'Aadhaar, electricity bill, bank account details and roof ownership proof.',
    status: 'pending',
    remark: '',
    completedAt: null,
    documents: [],
  }],
  logs: [{
    id: ID.log, at: WHEN, action: 'opened', step: null, stepName: '',
    by: ID.staff, byName: 'Ravi Kumar', byRole: 'agent', message: '', lat: null, lng: null, imageUrl: '',
  }],
  createdAt: WHEN,
  updatedAt: WHEN,
};

const moneyNumber = (description) => ({ type: 'number', nullable: true, minimum: 0, description });
const moneyDate = (description) => ({ type: 'string', nullable: true, maxLength: 30, description });

const loanPaths = moneyPaths({
  key: 'loan',
  prefix: 'loan',
  base: '/api/loans',
  tag: 'Loans',
  area: 'loans',
  areaLabel: 'Loans',
  noun: 'loan',
  Noun: 'Loan',
  openedBy: 'a loan (`loanRequired`)',
  viewPerm: 'Loans › View (`loans:view`)',
  updatePerm: 'Loans › Update loan & steps (`loans:update`)',
  statusEnum: LOAN_STATUS,
  statusHelp: '`in_progress` while the lender is working it, `completed` when it is sanctioned and disbursed, `rejected` when the lender refuses it. Finishing every step sets `completed` only from `in_progress`. Reopening a step sets `in_progress` only from `completed`.',
  search: 'client name, phone, or email, the proposal name, or `lender`',
  templateDefault: 'A company that has never saved loan steps gets an empty array (subsidy steps are the ones that start prefilled).',
  templateExample: [{ id: ID.template, name: 'Documents collected', description: 'ID proof, address proof, income proof, electricity bill and bank statements.' }],
  templateInput: [{ name: 'Documents collected', description: 'ID proof, address proof, income proof, electricity bill and bank statements.' }],
  syncEmpty: 'This loan already has every step of your template',
  detail: loanDetail,
  updateHelp: '`ifsc` is trimmed and stored in uppercase. When `amount`, `interestRate`, or `tenureMonths` is sent, `emi` is not sent, and the stored EMI is not already greater than 0, the server sets EMI from the reducing-balance monthly formula (whole currency units). A result of 0 is stored as null. An EMI you send, including a blank that becomes null, is kept as sent. `interestRate` is percent per year, 0 to 100. `tenureMonths` is 0 to 600.',
  fields: {
    lender: str('Bank or lender, up to 120 characters.'),
    branch: str('Lender branch, up to 120 characters. This is not the company branch.'),
    ifsc: str('Stored uppercase, up to 20 characters.'),
    accountRef: str('Application or account reference, up to 60 characters.'),
    amount: moneyNumber('Loan amount.'),
    interestRate: { type: 'number', nullable: true, minimum: 0, maximum: 100, description: 'Percent per year.' },
    tenureMonths: { type: 'number', nullable: true, minimum: 0, maximum: 600, description: 'Period in months.' },
    emi: moneyNumber('Monthly instalment. Filled by the server when amount, rate, and period are set and no EMI was sent or stored.'),
    downPayment: moneyNumber('Down payment.'),
    processingFee: moneyNumber('Processing fee.'),
    sanctionedOn: dateTime('Sanction date. Null until set.', { nullable: true }),
    disbursedOn: dateTime('Disbursement date. Null until set.', { nullable: true }),
  },
  updateProps: {
    lender: str('Up to 120 characters.'),
    branch: str('Up to 120 characters.'),
    ifsc: str('Up to 20 characters. Stored uppercase.'),
    accountRef: str('Up to 60 characters.'),
    amount: moneyNumber('Loan amount. Null clears it.'),
    interestRate: { type: 'number', nullable: true, minimum: 0, maximum: 100 },
    tenureMonths: { type: 'number', nullable: true, minimum: 0, maximum: 600 },
    emi: moneyNumber('Send this to keep a figure you typed. Omit it to let the server calculate when amount, rate, or period changes and no EMI is stored.'),
    downPayment: moneyNumber('Null clears it.'),
    processingFee: moneyNumber('Null clears it.'),
    sanctionedOn: moneyDate('A date string, or null to clear. An unparseable string is stored as null.'),
    disbursedOn: moneyDate('A date string, or null to clear.'),
  },
  updateExample: { lender: 'State Bank', ifsc: 'sbin0001234', amount: 200000, interestRate: 9.5, tenureMonths: 60, status: 'in_progress' },
});

const subsidyPaths = moneyPaths({
  key: 'subsidy',
  prefix: 'subsidy',
  base: '/api/subsidies',
  tag: 'Subsidies',
  area: 'subsidies',
  areaLabel: 'Subsidies',
  noun: 'subsidy',
  Noun: 'Subsidy',
  openedBy: 'a subsidy (`subsidy.enabled`). Central and state amounts start as the amounts on that proposal',
  viewPerm: 'Subsidies › View (`subsidies:view`)',
  updatePerm: 'Subsidies › Update subsidy & steps (`subsidies:update`)',
  statusEnum: SUBSIDY_STATUS,
  statusHelp: '`in_progress` while the claim is open, `completed` when the subsidy is credited, `rejected` when it is refused. Finishing every step sets `completed` only from `in_progress`. Reopening a step sets `in_progress` only from `completed`.',
  search: 'client name, phone, or email, the proposal name, `scheme`, `applicationNo`, or `consumerNo`',
  templateDefault: 'Until someone replaces them, a company\'s subsidy steps are the seven suggested ones: Documents collected, Registered on the portal, Application approved, Installation reported, Net meter & inspection, Commissioning & claim, Subsidy credited.',
  templateExample: [{ id: ID.template, name: 'Documents collected', description: 'Aadhaar, electricity bill, bank account details and roof ownership proof.' }],
  templateInput: [{ name: 'Documents collected', description: 'Aadhaar, electricity bill, bank account details and roof ownership proof.' }],
  syncEmpty: 'This subsidy already has every step of your template',
  detail: subsidyDetail,
  updateHelp: 'Amounts are currency units, 0 or more. `centralAmount` and `stateAmount` start as the proposal\'s subsidy figures and can be corrected here. `receivedAmount` is what has actually been credited.',
  fields: {
    scheme: str('Scheme name, for example PM Surya Ghar or a state scheme. Up to 120 characters.'),
    applicationNo: str('Application or registration number. Up to 60 characters.'),
    consumerNo: str('Electricity consumer number. Up to 60 characters.'),
    discom: str('Distribution company handling the approval. Up to 120 characters.'),
    centralAmount: moneyNumber('Expected central subsidy.'),
    stateAmount: moneyNumber('Expected state subsidy.'),
    receivedAmount: moneyNumber('Amount actually credited.'),
    approvedOn: dateTime('Approval date. Null until set.', { nullable: true }),
    creditedOn: dateTime('Credit date. Null until set.', { nullable: true }),
  },
  updateProps: {
    scheme: str('Up to 120 characters.'),
    applicationNo: str('Up to 60 characters.'),
    consumerNo: str('Up to 60 characters.'),
    discom: str('Up to 120 characters.'),
    centralAmount: moneyNumber('Null clears it.'),
    stateAmount: moneyNumber('Null clears it.'),
    receivedAmount: moneyNumber('Null clears it.'),
    approvedOn: moneyDate('A date string, or null to clear. An unparseable string is stored as null.'),
    creditedOn: moneyDate('A date string, or null to clear.'),
  },
  updateExample: { scheme: 'PM Surya Ghar', applicationNo: 'PSG-1001', consumerNo: '334455', discom: 'MSEDCL', centralAmount: 78000, stateAmount: 0 },
});

const stageCell = {
  type: 'object',
  properties: {
    count: { type: 'integer', description: 'Proposals in this stage.' },
    value: num('Sum of proposal totals (`summary.pricing.total`, otherwise `summary.cost`), rounded to 2 decimals.'),
    kwp: num('Sum of `summary.kwp`, rounded to 2 decimals.'),
  },
};

const dealValue = 'Proposal total: `summary.pricing.total` when that number is set, otherwise `summary.cost`.';

const homeSchema = {
  type: 'object',
  description: 'Sales pipeline, money received, and the short queues on the home screen. Installations, stock, leads, and "today" lists are on GET /api/dashboard/today.',
  properties: {
    generatedAt: dateTime('When this payload was built.'),
    totals: {
      type: 'object',
      properties: {
        clients: { type: 'integer', description: 'Clients in the branch.' },
        proposals: { type: 'integer', description: 'Proposals in the branch, every stage.' },
        kwp: num('Sum of `summary.kwp` across every proposal.'),
        wonKwp: num('Sum of `summary.kwp` on `won` proposals. Same number as `stages.won.kwp`.'),
      },
    },
    stages: {
      type: 'object',
      description: 'One key per proposal stage, in this order: draft, proposed, reproposed, negotiation, won, lost.',
      properties: {
        draft: stageCell, proposed: stageCell, reproposed: stageCell, negotiation: stageCell, won: stageCell, lost: stageCell,
      },
    },
    winRate: { type: 'integer', nullable: true, description: 'Percent, `won / (won + lost)`, rounded. Null when nothing has been won or lost yet.' },
    averageDeal: num('`stages.won.value / stages.won.count`, or 0 when nothing is won.'),
    money: {
      type: 'object',
      description: 'Booked proposals only. `billed` is the sum of payments recorded against those proposals (bills are treated as paid when they are made). It is not a separate invoice total.',
      properties: {
        quoted: num('Sum of won proposal totals.'),
        billed: num('Sum of payments on won proposals.'),
        yetToBill: num('Sum of max(0, total − paid) per won proposal. An overpayment on one job is not subtracted from the others.'),
        billedPct: { type: 'integer', description: '`billed / quoted` as a percent, capped at 100. 0 when `quoted` is 0.' },
      },
    },
    revenue: {
      type: 'array',
      description: 'The last 12 calendar months, oldest first. Months with no receipts are still present with amount 0.',
      items: {
        type: 'object',
        properties: {
          key: str('`YYYY-MM`.'),
          label: str('Short month and year in en-GB, for example `Apr 2026`.'),
          amount: num('Payments whose `receivedOn` falls in that month.'),
          count: { type: 'integer', description: 'How many of those payments.' },
        },
      },
    },
    thisMonth: num('`revenue` of the current month. Same as the last `revenue` row\'s `amount`.'),
    lastMonth: num('The month before. 0 when that row is missing.'),
    activity: {
      type: 'array',
      description: 'The last 6 of those 12 months, oldest first. `won` counts proposals created in the month whose status is `won` now, not proposals that changed to won during the month.',
      items: {
        type: 'object',
        properties: {
          key: str('`YYYY-MM`.'),
          label: str('Short month and year.'),
          created: { type: 'integer', description: 'Proposals created in the month.' },
          won: { type: 'integer', description: 'Of those, how many are `won` now.' },
        },
      },
    },
    attention: {
      type: 'object',
      properties: {
        clientChanges: {
          type: 'array',
          maxItems: 5,
          description: 'Open proposals (`proposed`, `reproposed`, `negotiation`) where the client decision is `changes_requested`. Newest response first.',
          items: {
            type: 'object',
            properties: {
              id: idProp('Proposal id.'),
              name: str('Proposal name.'),
              type: { type: 'string', enum: ['3d', 'quick'] },
              client: str('Client name, or empty.'),
              note: str('The client\'s note.'),
              value: num(dealValue),
              respondedAt: dateTime('When the client responded, or the proposal `updatedAt`.'),
            },
          },
        },
        followUp: {
          type: 'array',
          maxItems: 5,
          description: 'Open proposals with no client decision, not touched for 7 days. Oldest `updatedAt` first.',
          items: {
            type: 'object',
            properties: {
              id: idProp('Proposal id.'),
              name: str('Name.'),
              type: { type: 'string', enum: ['3d', 'quick'] },
              client: str('Client name.'),
              value: num(dealValue),
              updatedAt: dateTime('Proposal `updatedAt`.'),
            },
          },
        },
        invoice: {
          type: 'array',
          maxItems: 5,
          description: 'Won proposals with a total above 0 and no sale document yet. AMC-parts invoices do not count as that document.',
          items: {
            type: 'object',
            properties: {
              id: idProp('Proposal id.'),
              name: str('Name.'),
              client: str('Client name.'),
              total: num(dealValue),
              paid: num('Sum of payments on this proposal.'),
              balance: num('`total` minus `paid`. Can be negative.'),
              invoiceNo: str('Empty in this queue. On the full won list this is the newest sale document number: an invoice (not void, not AMC parts), a bill number, or an open e-way bill number.'),
              lastPaymentOn: dateTime('`receivedOn` of the latest payment, or null.', { nullable: true }),
              wonOn: dateTime('The proposal `updatedAt`. There is no separate won-on timestamp.'),
            },
          },
        },
      },
    },
    recentPayments: {
      type: 'array',
      maxItems: 6,
      description: 'Newest payments by `receivedOn`.',
      items: {
        type: 'object',
        properties: {
          id: idProp('Payment id.'),
          receiptNo: str('Receipt number.'),
          amount: num('Amount received.'),
          mode: { type: 'string', enum: PAYMENT_MODES, description: 'How it was paid.' },
          receivedOn: dateTime('When it was received.'),
          client: str('Client name, or empty.'),
          design: str('Proposal name, or empty.'),
          designId: str('Proposal id, or `""` when the payment has no proposal.'),
        },
      },
    },
    recentProposals: {
      type: 'array',
      maxItems: 6,
      description: 'Proposals by `updatedAt` descending, every stage.',
      items: {
        type: 'object',
        properties: {
          id: idProp('Proposal id.'),
          name: str('Name.'),
          type: { type: 'string', enum: ['3d', 'quick'] },
          status: { type: 'string', enum: DESIGN_STATUS },
          client: str('Client name.'),
          kwp: num('`summary.kwp`, or 0.'),
          panels: num('`summary.panels`, or 0.'),
          value: num(dealValue),
          updatedAt: dateTime('Proposal `updatedAt`.'),
        },
      },
    },
  },
};

const zeroStage = { count: 0, value: 0, kwp: 0 };
const homeExample = {
  generatedAt: WHEN,
  totals: { clients: 12, proposals: 4, kwp: 18.5, wonKwp: 5 },
  stages: {
    draft: { count: 1, value: 0, kwp: 0 },
    proposed: { count: 1, value: 210000, kwp: 4 },
    reproposed: zeroStage,
    negotiation: zeroStage,
    won: { count: 1, value: 280000, kwp: 5 },
    lost: { count: 1, value: 150000, kwp: 3 },
  },
  winRate: 50,
  averageDeal: 280000,
  money: { quoted: 280000, billed: 100000, yetToBill: 180000, billedPct: 36 },
  revenue: [{ key: '2026-04', label: 'Apr 2026', amount: 100000, count: 1 }],
  thisMonth: 100000,
  lastMonth: 0,
  activity: [{ key: '2026-04', label: 'Apr 2026', created: 2, won: 1 }],
  attention: {
    clientChanges: [{ id: ID.design, name: 'Sharma rooftop 5 kW', type: '3d', client: 'A. Sharma', note: 'Please move the inverter.', value: 210000, respondedAt: WHEN }],
    followUp: [{ id: ID.design, name: 'Patil 3 kW', type: 'quick', client: 'Patil', value: 150000, updatedAt: WHEN }],
    invoice: [{ id: ID.design, name: 'Sharma rooftop 5 kW', client: 'A. Sharma', total: 280000, paid: 0, balance: 280000, invoiceNo: '', lastPaymentOn: null, wonOn: WHEN }],
  },
  recentPayments: [{ id: ID.invoice, receiptNo: 'RCT-0004', amount: 100000, mode: 'upi', receivedOn: WHEN, client: 'A. Sharma', design: 'Sharma rooftop 5 kW', designId: ID.design }],
  recentProposals: [{ id: ID.design, name: 'Sharma rooftop 5 kW', type: '3d', status: 'won', client: 'A. Sharma', kwp: 5, panels: 10, value: 280000, updatedAt: WHEN }],
};

const todaySchema = {
  type: 'object',
  description: 'What needs doing, who owes money is not here (that is GET /api/dashboard `money`), where leads come from, and where installations stand. Counts plus a few rows. The example arrays are shorter than a live response; each description names the cap.',
  properties: {
    generatedAt: dateTime('When this payload was built.'),
    amc: {
      type: 'object',
      description: 'Open scheduled visits, counted the same way as the AMC board. A visit counts when it is not `completed`, `booked` is true, and `daysLeft` is a number.',
      properties: {
        dueToday: { type: 'integer', description: 'Those visits with `daysLeft` 0.' },
        next30: { type: 'integer', description: 'Those visits with `daysLeft` from 1 to 30.' },
        overdue: { type: 'integer', description: 'Those visits with `daysLeft` below 0.' },
        visits: {
          type: 'array',
          maxItems: 6,
          description: 'Visits due today or overdue, most overdue first. `client` and `assignee` are names, not objects.',
          items: {
            type: 'object',
            properties: {
              id: str('Visit id.'),
              projectId: idProp('Installation id.'),
              client: str('Client name, or empty.'),
              address: str('Proposal address.'),
              visit: str('Visit name.'),
              assignee: str('Assignee name, or empty.'),
              daysLeft: { type: 'integer', description: 'Negative when overdue. 0 is due today.' },
            },
          },
        },
      },
    },
    money: { type: 'object', properties: { spentThisMonth: num('Sum of expenses whose `spentOn` is on or after the 1st of this month.') } },
    proposals: {
      type: 'object',
      properties: {
        changes: { type: 'integer', description: 'Open proposals where the client asked for changes.' },
        noReply: { type: 'integer', description: 'Open proposals with no client decision, untouched for 7 days.' },
        noInvoice: { type: 'integer', description: 'Won proposals with a price and none of: a non-void invoice that is not AMC parts, a non-void bill, or an e-way bill whose status is `open` or `billed`.' },
      },
    },
    expiring: {
      type: 'object',
      properties: {
        count: { type: 'integer', description: 'Open proposals whose `validUntil` is today through the next 7 days.' },
        expired: { type: 'integer', description: 'Open proposals whose `validUntil` is before today.' },
        items: {
          type: 'array',
          maxItems: 5,
          description: 'The soonest of `count`, not the expired ones.',
          items: {
            type: 'object',
            properties: {
              id: idProp('Proposal id.'),
              name: str('Name.'),
              type: { type: 'string', enum: ['3d', 'quick'] },
              client: str('Client name.'),
              value: num(dealValue),
              validUntil: dateTime('Last day the price holds.'),
              daysLeft: { type: 'integer', description: 'Days from today until `validUntil`.' },
            },
          },
        },
      },
    },
    installations: {
      type: 'object',
      properties: {
        active: { type: 'integer', description: 'Installations with status `active`.' },
        byStep: {
          type: 'array',
          description: 'How many active installations are on each step (the first step that is not `done`). Order follows that step\'s index. A job whose steps are all done while it is still active is under the label `All steps done`.',
          items: { type: 'object', properties: { step: str('Step name.'), count: { type: 'integer' } } },
        },
        notStarted: { type: 'integer', description: 'Won proposals that have no installation.' },
        unassignedSteps: { type: 'integer', description: 'Not-done steps on active installations with no assignee. A count of steps, not jobs.' },
        stuck: {
          type: 'array',
          maxItems: 5,
          description: 'The longest-stuck of `stuckCount`. A step is stuck when it is `in_progress` and `startedAt` is more than 7 days ago.',
          items: {
            type: 'object',
            properties: {
              projectId: idProp('Installation id.'),
              project: str('Proposal name.'),
              client: str('Client name.'),
              step: str('Step name.'),
              assignee: str('Assignee name, or empty.'),
              days: { type: 'integer', description: 'Whole days since `startedAt`.' },
            },
          },
        },
        stuckCount: { type: 'integer', description: 'All stuck steps, not just the five rows.' },
        finishedThisMonth: { type: 'integer', description: 'Installations whose `installationCompletedAt` is on or after the 1st of this month.' },
        avgDaysToFinish: { type: 'integer', nullable: true, description: 'Mean whole days from the installation `createdAt` to `installationCompletedAt`, for jobs finished in the last 180 days. Null when none were.' },
      },
    },
    loans: {
      type: 'object',
      properties: {
        missing: { type: 'integer', description: 'Won proposals with `loanRequired` and no loan file.' },
        missingItems: {
          type: 'array',
          maxItems: 5,
          description: 'The first five of those proposals, not loan ids.',
          items: { type: 'object', properties: { id: idProp('Proposal id.'), name: str('Name.'), type: { type: 'string', enum: ['3d', 'quick'] }, client: str('Client name.') } },
        },
        open: { type: 'integer', description: 'Loan files with status `in_progress`.' },
        openAmount: num('Sum of `amount` on those open loans. Null amounts count as 0.'),
      },
    },
    subsidies: {
      type: 'object',
      properties: {
        missing: { type: 'integer', description: 'Won proposals with `subsidy.enabled` and no subsidy file.' },
        missingItems: {
          type: 'array',
          maxItems: 5,
          items: { type: 'object', properties: { id: idProp('Proposal id.'), name: str('Name.'), type: { type: 'string', enum: ['3d', 'quick'] }, client: str('Client name.') } },
        },
        open: { type: 'integer', description: 'Subsidy files with status `in_progress`.' },
        expected: num('Sum of `centralAmount` + `stateAmount` on those open files.'),
      },
    },
    stock: {
      type: 'object',
      properties: {
        low: { type: 'integer', description: 'Products with stock above 0 and at or below `reorderLevel`.' },
        outOfStock: { type: 'integer', description: 'Products with stock 0 or less.' },
        products: { type: 'integer', description: 'Products in the shared catalog.' },
        value: num('Qty on hand times purchase price, or base price when purchase price is empty.'),
        items: {
          type: 'array',
          maxItems: 5,
          description: 'Out-of-stock products first, then low stock, least stock first, then name. Each row is the product, not a batch.',
          items: {
            type: 'object',
            properties: {
              id: idProp('Product id.'),
              name: str('Product name.'),
              unit: str('Unit, or empty.'),
              category: str('Category name, or `No category`.'),
              reorderLevel: num('Reorder level. 0 when unset.'),
              stock: num('Qty on hand.'),
            },
          },
        },
        byCategory: {
          type: 'array',
          maxItems: 8,
          description: 'On-hand value by category, highest first.',
          items: { type: 'object', properties: { category: str('Category name.'), value: num('On-hand value.') } },
        },
        warrantiesEnding: { type: 'integer', description: 'Installed serial units whose warranty ends from today through the next 60 days.' },
        warranties: {
          type: 'array',
          maxItems: 5,
          description: 'The soonest of those.',
          items: {
            type: 'object',
            properties: {
              id: idProp('Serial unit id.'),
              serialNo: str('Serial number.'),
              product: str('Product name.'),
              client: str('Client on the installation, or empty.'),
              projectId: str('Installation id, or `""` when the unit is not linked.'),
              endsOn: dateTime('Warranty end.'),
              daysLeft: { type: 'integer', description: 'Days from today until `endsOn`.' },
            },
          },
        },
      },
    },
    support: {
      type: 'object',
      properties: {
        open: { type: 'integer', description: 'Client-help tickets with status `open` or `in_progress`.' },
        unread: { type: 'integer', description: 'Client-help tickets with `teamUnread` greater than 0.' },
      },
    },
    leads: {
      type: 'object',
      properties: {
        unassigned: { type: 'integer', description: 'Live leads with no assignee, all time, across the three sources. Not limited to 90 days.' },
        byStatus: {
          type: 'array',
          description: 'Every live lead by the status the lead list shows. The first row is always `{ id: "none", name: "Not started", color: "slate", outcome: "open" }`. Later rows are the company\'s statuses, including a deleted status that still has leads.',
          items: {
            type: 'object',
            properties: {
              id: str('Status id, or `none`.'),
              name: str('Status name.'),
              color: { type: 'string', enum: ['slate', 'blue', 'amber', 'emerald', 'rose', 'purple', 'cyan'] },
              outcome: { type: 'string', enum: ['open', 'converted', 'lost'] },
              count: { type: 'integer' },
            },
          },
        },
        sources: {
          type: 'array',
          description: 'Always these three, in this order. `total`, `contacted`, and `converted` are the last 90 days. `unassigned` on each source is all-time. Meta counts only processed, not-deleted leads. Contacted means the lead\'s status field is set (Meta uses `adminStatus`; Google and manual use `status`).',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['meta', 'google', 'manual'] },
              label: { type: 'string', enum: ['Facebook / Instagram', 'Google Ads', 'Added by your team'] },
              unassigned: { type: 'integer' },
              total: { type: 'integer', description: 'Created in the last 90 days.' },
              contacted: { type: 'integer', description: 'Of those, how many have a status.' },
              converted: { type: 'integer', description: 'Of those, how many have `convertedClient` set.' },
            },
          },
        },
        funnel: {
          type: 'object',
          description: 'Sums of the 90-day source numbers.',
          properties: {
            leads: { type: 'integer' },
            contacted: { type: 'integer' },
            converted: { type: 'integer' },
          },
        },
      },
    },
    monthly: {
      type: 'array',
      description: '12 months, oldest first. Every row has `key`, `label`, `spent`, `finished`. Only the latest 6 rows also have `leads` and `stockReceived`.',
      items: {
        type: 'object',
        properties: {
          key: str('`YYYY-MM`.'),
          label: str('Short month and year.'),
          spent: num('Expenses in that month.'),
          finished: { type: 'integer', description: 'Installations whose `installationCompletedAt` falls in that month.' },
          leads: {
            type: 'object',
            description: 'Present on the latest 6 months only. Leads created that month.',
            properties: { meta: { type: 'integer' }, google: { type: 'integer' }, manual: { type: 'integer' } },
          },
          stockReceived: num('Purchase value of stock received that month (purchase price, else base price). Latest 6 months only.'),
        },
      },
    },
    paymentModes: {
      type: 'array',
      description: 'Payments in the last 12 months, grouped by `mode`, largest amount first. A payment with no mode is `other`.',
      items: { type: 'object', properties: { mode: { type: 'string', enum: PAYMENT_MODES }, amount: num('Sum for that mode.') } },
    },
    staff: {
      type: 'object',
      properties: {
        visitsUnassigned: { type: 'integer', description: 'AMC visits that are not completed, not a "needs installation" placeholder, and have no assignee.' },
        members: {
          type: 'array',
          description: 'Agents, plus anyone else who currently holds leads or visits, sorted by name. Installation task counts are not here.',
          items: {
            type: 'object',
            properties: {
              id: idProp('User id.'),
              name: str('Name.'),
              active: bool('False when the account cannot sign in.'),
              leads: {
                type: 'object',
                properties: {
                  assigned: { type: 'integer', description: 'Live leads assigned to them.' },
                  notStarted: { type: 'integer', description: 'Of those, how many have no status.' },
                  converted: { type: 'integer', description: 'Of those, how many sit in a status whose outcome is `converted`.' },
                },
              },
              visits: {
                type: 'object',
                properties: {
                  open: { type: 'integer', description: 'Their not-completed AMC visits.' },
                  late: { type: 'integer', description: 'Of those, booked visits with `daysLeft` below 0.' },
                  today: { type: 'integer', description: 'Of those, booked visits with `daysLeft` 0.' },
                },
              },
            },
          },
        },
      },
    },
    impact: {
      type: 'object',
      properties: {
        kwp: num('Sum of `summary.kwp` on won proposals.'),
        annualKwh: { type: 'integer', description: 'Sum of `summary.annualKwh` on won proposals, rounded to a whole number.' },
        co2Tonnes: num('`annualKwh * 0.7 / 1000`, rounded to 2 decimals. 0.7 kg CO2 per kWh is the factor the proposal PDF uses.'),
        installed: { type: 'integer', description: 'Installations that have `installationCompletedAt` set.' },
      },
    },
  },
};

const todayExample = {
  generatedAt: WHEN,
  amc: { dueToday: 1, next30: 2, overdue: 0, visits: [{ id: ID.visit, projectId: ID.project, client: 'A. Sharma', address: '12 MG Road, Pune', visit: '1st service', assignee: 'Ravi Kumar', daysLeft: 0 }] },
  money: { spentThisMonth: 4500 },
  proposals: { changes: 1, noReply: 2, noInvoice: 1 },
  expiring: { count: 1, expired: 0, items: [{ id: ID.design, name: 'Sharma rooftop 5 kW', type: '3d', client: 'A. Sharma', value: 280000, validUntil: '2026-04-08T00:00:00.000Z', daysLeft: 6 }] },
  installations: {
    active: 3,
    byStep: [{ step: 'Site inspection', count: 2 }, { step: 'Structure installation', count: 1 }],
    notStarted: 1,
    unassignedSteps: 2,
    stuck: [{ projectId: ID.project, project: 'Sharma rooftop 5 kW', client: 'A. Sharma', step: 'Site inspection', assignee: 'Ravi Kumar', days: 9 }],
    stuckCount: 1,
    finishedThisMonth: 1,
    avgDaysToFinish: 18,
  },
  loans: { missing: 1, missingItems: [{ id: ID.design, name: 'Sharma rooftop 5 kW', type: '3d', client: 'A. Sharma' }], open: 2, openAmount: 200000 },
  subsidies: { missing: 0, missingItems: [], open: 1, expected: 78000 },
  stock: {
    low: 1,
    outOfStock: 0,
    products: 40,
    value: 250000,
    items: [{ id: ID.template, name: 'DC MCB', unit: 'Nos', category: 'Electricals', reorderLevel: 5, stock: 2 }],
    byCategory: [{ category: 'Electricals', value: 80000 }],
    warrantiesEnding: 1,
    warranties: [{ id: ID.doc, serialNo: 'SN-100', product: 'Waaree 500W', client: 'A. Sharma', projectId: ID.project, endsOn: '2026-05-01T00:00:00.000Z', daysLeft: 29 }],
  },
  support: { open: 1, unread: 1 },
  leads: {
    unassigned: 3,
    byStatus: [{ id: 'none', name: 'Not started', color: 'slate', outcome: 'open', count: 4 }],
    sources: [
      { key: 'meta', label: 'Facebook / Instagram', unassigned: 2, total: 10, contacted: 6, converted: 1 },
      { key: 'google', label: 'Google Ads', unassigned: 1, total: 4, contacted: 2, converted: 0 },
      { key: 'manual', label: 'Added by your team', unassigned: 0, total: 3, contacted: 3, converted: 1 },
    ],
    funnel: { leads: 17, contacted: 11, converted: 2 },
  },
  monthly: [
    { key: '2025-05', label: 'May 2025', spent: 0, finished: 0 },
    { key: '2026-04', label: 'Apr 2026', spent: 4500, finished: 1, leads: { meta: 2, google: 1, manual: 0 }, stockReceived: 20000 },
  ],
  paymentModes: [{ mode: 'upi', amount: 100000 }],
  staff: {
    visitsUnassigned: 1,
    members: [{ id: ID.staff, name: 'Ravi Kumar', active: true, leads: { assigned: 5, notStarted: 1, converted: 1 }, visits: { open: 1, late: 0, today: 1 } }],
  },
  impact: { kwp: 5, annualKwh: 7500, co2Tonnes: 5.25, installed: 4 },
};

const countsSchema = {
  type: 'object',
  description: 'Sidebar badges for a branch owner or company admin. Every key is always present. Staff use GET /api/my/counts, which omits keys they cannot view.',
  properties: {
    clients: { type: 'integer', description: 'Clients in the branch.' },
    loans: { type: 'integer', description: 'Loan files with status `in_progress`.' },
    subsidies: { type: 'integer', description: 'Subsidy files with status `in_progress`.' },
    expenses: { type: 'integer', description: 'Proposals that are won, or that have an expense or a budget. Capped at 1000.' },
    suppliers: { type: 'integer', description: 'Suppliers.' },
    support: { type: 'integer', description: 'Tickets with the platform team that are `open` or `in_progress`.' },
    designs: { type: 'integer', description: 'Proposals.' },
    estimates: { type: 'integer', description: 'Saved estimates.' },
    billing: { type: 'integer', description: 'Parties who still owe money: a won proposal, or a client billed with no proposal, where open e-way bills plus non-void bills exceed payments received.' },
    packages: { type: 'integer', description: 'Packages.' },
    installations: { type: 'integer', description: 'Installations with status `active`.' },
    amc: { type: 'integer', description: 'Completed installations that still have a pending AMC visit. 0 when the company has no AMC templates.' },
    clientSupport: { type: 'integer', description: 'Client-help tickets `open` or `in_progress`.' },
    team: { type: 'integer', description: 'Staff accounts (`role: agent`).' },
    agentRoles: { type: 'integer', description: 'Job titles in the company list.' },
    installationSteps: { type: 'integer', description: 'Rows in the installation step template.' },
    amcTemplates: { type: 'integer', description: 'AMC schedules.' },
    loanSteps: { type: 'integer', description: 'Rows in the loan step template.' },
    subsidySteps: { type: 'integer', description: 'Rows in the subsidy step template.' },
    installationCharges: { type: 'integer', description: 'Installation charge rows.' },
    products: { type: 'integer', description: 'Products in the shared catalog.' },
    categories: { type: 'integer', description: 'Catalog categories.' },
    productUnits: { type: 'integer', description: 'Unit labels. The default list length when the company has not saved its own.' },
    leads: { type: 'integer', description: '`metaLeads + googleLeads + manualLeads`.' },
    metaLeads: { type: 'integer', description: 'Processed, not-deleted Meta leads.' },
    googleLeads: { type: 'integer', description: 'Not-deleted Google Ads leads.' },
    manualLeads: { type: 'integer', description: 'Not-deleted leads added by the team.' },
  },
};

const countsExample = {
  clients: 12, loans: 2, subsidies: 1, expenses: 4, suppliers: 3, support: 0, designs: 20, estimates: 5, billing: 2,
  packages: 6, installations: 3, amc: 4, clientSupport: 1, team: 8, agentRoles: 5, installationSteps: 5, amcTemplates: 2,
  loanSteps: 5, subsidySteps: 7, installationCharges: 3, products: 40, categories: 8, productUnits: 22, leads: 17, metaLeads: 10, googleLeads: 4, manualLeads: 3,
};

const dashWho = `**Who.** Bearer token, and the role must be \`company\` or \`branch\` (\`companyOnly\`). Staff (\`role: agent\`) are 403 \`You do not have access to this area\`. They use \`GET /api/my/counts\` for sidebar numbers and \`/api/my/projects\` for their jobs. There is no query and no body. The numbers are for the branch in the token.`;

const dashboardPaths = {
  '/api/dashboard/counts': {
    get: operation('Dashboard', 'dashboardCounts', 'Sidebar counts for the branch', `${dashWho}

**Behaviour.** One integer per sidebar item. \`installations\` is active jobs only. \`loans\` and \`subsidies\` are files still \`in_progress\`. \`billing\` is parties who have been billed more than they have paid. \`amc\` is completed installations that still have a pending visit.`, {
      responses: done({ 200: json('Every sidebar count.', countsSchema, countsExample) }, 401, 403, 500),
    }),
  },
  '/api/dashboard/today': {
    get: operation('Dashboard', 'dashboardToday', 'Today widget for the home screen', `${dashWho}

**Behaviour.** The operational half of the home screen: AMC due, quotes that need a reply, installations by step, loans and subsidies not yet opened, stock, leads, the monthly charts, and staff workload. Money totals and the proposal pipeline are \`GET /api/dashboard\`. Link a count to its list with that list's \`show\` query where one exists (\`stuck\`, \`unassigned\`, \`finished_month\` on installations).`, {
      responses: done({ 200: json('Today payload. Arrays in the example are shorter than the live caps named on each field.', todaySchema, todayExample) }, 401, 403, 500),
    }),
  },
  '/api/dashboard': {
    get: operation('Dashboard', 'dashboardGet', 'Pipeline, revenue, and attention queues', `${dashWho}

**Behaviour.** The commercial half of the home screen. \`stages\` has exactly the six proposal statuses. \`revenue\` is 12 months. \`activity\` is the latest 6 of those months. \`money.billed\` is payments received on won proposals, not a separate bill total. \`attention.invoice\` is won work with a price and no sale document (invoice, bill, or open e-way bill). AMC-parts invoices are ignored there.`, {
      responses: done({ 200: json('Pipeline payload. `revenue` and `activity` in the example show one month; the live arrays are 12 and 6.', homeSchema, homeExample) }, 401, 403, 500),
    }),
  },
};

export default {
  ...installationPaths,
  ...loanPaths,
  ...subsidyPaths,
  ...dashboardPaths,
};
