/**
 * OpenAPI paths for /api/leads only.
 * Success JSON is the value itself. Nothing is wrapped in { data }.
 * Controller failures use { message }. Route and auth middleware use { error }.
 */

const tags = ['Leads'];
const security = [{ bearerAuth: [] }];
const oid = { $ref: '#/components/schemas/ObjectId' };

const unauthorized = { $ref: '#/components/responses/Unauthorized' };
const forbidden = { $ref: '#/components/responses/Forbidden' };
const rateLimited = { $ref: '#/components/responses/RateLimited' };
const serverError = { $ref: '#/components/responses/ServerError' };

const GATE = 'Every path is mounted at `/api/leads` with `withAreaAccess(\'leads\')`, after the bearer token is checked. A branch owner (`role: branch`) or company admin (`role: company`) passes that gate. Staff (`role: agent`) pass it only when they have at least one `leads:*` permission. Otherwise the response is **403** `{ "error": "You don\'t have access to Leads. Ask your company admin." }`. A missing or expired token is **401** `{ "error": "Your session has expired. Sign in again." }`. A signed-in user with no company on the token gets **403** `{ "message": "Lead integrations are only available inside a company workspace." }` (the key is `message`, not `error`).';

const WHO = `**Which leads this caller sees.** \`scopeToOwnLeads\` runs on every route. Branch owners and company admins, and staff with \`leads:view_all\`, are not filtered. Staff with \`leads:view_team\` and without \`leads:view_all\` are limited to themselves plus their active direct reports (users with \`role: agent\`, \`active: true\`, and \`manager\` equal to the caller, same company). Any other staff member is limited to their own user id.

Lists, the board, the activity feed, export, and Meta assignment history include a lead the caller holds **now** and a lead they (or a teammate, in the team scope) held **before**. A previous holder can still open it. Writes — manual edit, status, priority, assign, and convert — require the lead to be assigned to that person **right now** (\`assignedTo\` matches the scope). A previous holder gets **404** \`{ "message": "Lead not found" }\`. Unassigned leads are hidden from a scoped caller: the quick-assign count is 0 and those leads never appear in their lists.`;

const messageSchema = {
  type: 'object',
  required: ['message'],
  properties: { message: { type: 'string', description: 'Sentence the screen can show. Controllers use this key. It is not `error`.' } },
};

const errorOnlySchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string', description: 'Sentence the screen can show. The route middleware uses this key.' } },
};

const json = (description, schema, example) => ({
  description,
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } },
});

const messageResponse = (description, example) => json(description, messageSchema, { message: example });

const dateTime = { type: 'string', format: 'date-time' };
const nullableDate = { type: 'string', format: 'date-time', nullable: true };

const statusColors = ['slate', 'blue', 'amber', 'emerald', 'rose', 'purple', 'cyan'];

const leadStatus = {
  type: 'object',
  required: ['_id', 'name', 'color', 'order', 'outcome', 'isConversion', 'requiresDate', 'isActive'],
  properties: {
    _id: oid,
    name: { type: 'string', description: 'Label the company gave this step. Do not hard-code names.' },
    color: { type: 'string', enum: statusColors },
    order: { type: 'integer', description: 'Lower numbers come first in the pipeline and on the board.' },
    outcome: { type: 'string', enum: ['open', 'converted', 'lost'], description: 'Every company has one `converted` status and one `lost` status. Every other status is `open`.' },
    isConversion: { type: 'boolean', description: 'True only for the converted status. Kept equal to `outcome === "converted"`.' },
    requiresDate: { type: 'boolean', description: 'When true, a status change must send `scheduledAt`. The seeded Callback and Site visit statuses do **not** set this; only this flag matters.' },
    isActive: { type: 'boolean', description: 'False means the status stays on old leads but cannot be chosen.' },
  },
};

const currentStatus = {
  type: 'object',
  nullable: true,
  description: 'Null when the lead has no status yet (the board column "Not started").',
  required: ['_id', 'name', 'color'],
  properties: {
    _id: oid,
    name: { type: 'string' },
    color: { type: 'string' },
    isConversion: { type: 'boolean', description: 'Present on some Meta payloads when the status was copied from `adminStatus`. Absent when it came from the owner assignment. Use GET /api/leads/statuses for `outcome` and `requiresDate`.' },
  },
};

const assigneeRef = {
  type: 'object',
  nullable: true,
  required: ['_id', 'name'],
  properties: {
    _id: oid,
    name: { type: 'string' },
  },
};

const historyEntry = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true, description: 'User id of that holder, or null.' },
    name: { type: 'string' },
    assignedAt: nullableDate,
    endedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Null while this person still holds the lead.' },
    byName: { type: 'string', description: 'Who made the change. Omitted on the combined-list card; present on manual and Google detail rows.' },
  },
};

const scheduleEntry = {
  type: 'object',
  properties: {
    scheduledAt: nullableDate,
    statusName: { type: 'string' },
    replacedAt: dateTime,
    byName: { type: 'string' },
  },
};

const logEntry = {
  type: 'object',
  properties: {
    action: { type: 'string', description: 'lead_assigned, lead_reassigned, lead_unassigned, lead_status, lead_rescheduled, or referral.' },
    message: { type: 'string' },
    byName: { type: 'string' },
    at: dateTime,
  },
};

const statusHistoryEntry = {
  type: 'object',
  properties: {
    statusName: { type: 'string' },
    statusColor: { type: 'string' },
    remark: { type: 'string' },
    scheduledAt: nullableDate,
    rescheduled: { type: 'boolean', description: 'True when this change moved an earlier date.' },
    changedAt: dateTime,
    changedByName: { type: 'string', description: 'Set on manual leads. Omitted on Google leads.' },
  },
};

const cardLead = {
  type: 'object',
  description: 'Short card used by GET /api/leads/all, the board, and nowhere else. Manual and Google list rows are the fuller detail objects. There is no GET-by-id.',
  required: ['_id', 'leadSource', 'sourceLabel', 'fullName', 'phone', 'address', 'isPriority'],
  properties: {
    _id: oid,
    leadSource: { type: 'string', enum: ['meta', 'google', 'manual', 'import'], description: 'A portal referral is `manual` with `sourceLabel` "Referral".' },
    sourceLabel: { type: 'string', enum: ['Meta', 'Google Ads', 'Added', 'Imported', 'Referral'] },
    fullName: { type: 'string' },
    phone: { type: 'string' },
    address: { type: 'string', description: 'Filled for manual leads. Empty string for Meta and Google cards (their address, when the form had one, is not copied onto this card).' },
    receivedAt: dateTime,
    createdAt: dateTime,
    assignedTo: assigneeRef,
    assignedAt: nullableDate,
    isPriority: { type: 'boolean', description: 'The only priority value. There is no high/medium/low scale.' },
    scheduledAt: nullableDate,
    rescheduledCount: { type: 'integer' },
    isRescheduled: { type: 'boolean' },
    isReassigned: { type: 'boolean' },
    reassignedCount: { type: 'integer' },
    assignmentHistory: { type: 'array', items: historyEntry, description: 'Oldest first. `endedAt` null means the current holder. `byName` is not included on this card.' },
    heldBefore: { type: 'boolean', description: 'Always false. The list does not compute it. Do not use it to decide read-only; a 404 on a write means the caller no longer holds the lead.' },
    previousSchedules: { type: 'array', items: scheduleEntry },
    currentStatus,
    convertedClient: { nullable: true, allOf: [oid], description: 'Client id once the lead has been linked. Null before that.' },
    convertedClientName: { type: 'string' },
    convertedAt: nullableDate,
    referredByClientName: { type: 'string', description: 'Present only when this manual lead is a portal referral.' },
    referredByClientPhone: { type: 'string', description: 'Present only on a portal referral.' },
  },
};

const formField = {
  type: 'object',
  required: ['key', 'label', 'type', 'required'],
  properties: {
    key: { type: 'string', description: 'Storage key. Send this as the JSON key on create and update. Fixed keys are `name`, `phone`, `address`.' },
    label: { type: 'string', description: 'Caption to show. Also the spreadsheet column heading.' },
    type: { type: 'string', enum: ['text', 'textarea', 'number', 'phone', 'email', 'select', 'multiselect', 'date', 'yesno'] },
    required: { type: 'boolean' },
    fixed: { type: 'boolean', description: 'True only on Name, Phone, and Address. Those three are always first and are not inside `fields` on the saved lead.' },
    help: { type: 'string', description: 'Hint. Present on company fields (empty string when unset). Absent on the three fixed fields.' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'Choices for `select` and `multiselect`. Empty array for other company fields. Absent on the three fixed fields.',
    },
  },
};

const manualLead = {
  type: 'object',
  description: 'One manual lead, as returned by the manual list, create, update, and manual status change. This is the detail. There is no separate GET /api/leads/manual/{id}.',
  required: ['_id', 'fullName', 'phone', 'address', 'fields', 'source', 'isPriority'],
  properties: {
    _id: oid,
    fullName: { type: 'string', maxLength: 120 },
    phone: { type: 'string', maxLength: 20 },
    address: { type: 'string' },
    fields: {
      type: 'object',
      description: 'Answers for company fields only, keyed by `key` from GET /api/leads/form. Name, phone, and address are the top-level properties, not keys inside here. Values: string (text, textarea, phone, email, select, date `YYYY-MM-DD`), number, boolean (yes/no), or string array (multiselect).',
      additionalProperties: true,
    },
    source: { type: 'string', enum: ['manual', 'import', 'referral'], description: '`manual` typed on the form, `import` from a sheet, `referral` from a client portal. Create always stores `manual`. Import always stores `import`.' },
    referredByClient: { nullable: true, allOf: [oid] },
    referredByClientName: { type: 'string' },
    referredByClientPhone: { type: 'string' },
    referredByClientEmail: { type: 'string' },
    createdAt: dateTime,
    leadCreatedAt: dateTime,
    createdByName: { type: 'string' },
    assignedTo: assigneeRef,
    assignedAt: nullableDate,
    isPriority: { type: 'boolean' },
    convertedClient: { nullable: true, allOf: [oid] },
    convertedClientName: { type: 'string' },
    convertedAt: nullableDate,
    convertedByName: { type: 'string' },
    currentStatus,
    scheduledAt: nullableDate,
    rescheduledCount: { type: 'integer' },
    isRescheduled: { type: 'boolean' },
    isReassigned: { type: 'boolean' },
    reassignedCount: { type: 'integer' },
    assignmentHistory: { type: 'array', items: historyEntry },
    logs: { type: 'array', items: logEntry },
    previousSchedules: { type: 'array', items: scheduleEntry },
    statusHistory: { type: 'array', items: statusHistoryEntry, description: 'Oldest first. Each entry keeps the name and color from the moment it was saved.' },
  },
};

const googleLead = {
  type: 'object',
  description: 'One Google Ads lead as returned by GET /api/leads/google. This is the detail. There is no GET-by-id.',
  properties: {
    _id: oid,
    externalLeadId: { type: 'string', description: 'Google Ads lead id.' },
    fullName: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    formName: { type: 'string', description: 'Always the literal "Google Ads lead form".' },
    campaignName: { type: 'string', description: '`Campaign <campaignId>` when a campaign id was stored, otherwise "".' },
    isTest: { type: 'boolean' },
    fields: { type: 'object', additionalProperties: true, description: 'Answers keyed by Google\'s column id, or by the question text for custom questions. Not a fixed schema.' },
    leadCreatedAt: dateTime,
    createdAt: dateTime,
    assignedTo: assigneeRef,
    assignedAt: nullableDate,
    isPriority: { type: 'boolean' },
    convertedClient: { nullable: true, allOf: [oid] },
    convertedClientName: { type: 'string' },
    convertedAt: nullableDate,
    convertedByName: { type: 'string' },
    currentStatus,
    scheduledAt: nullableDate,
    isReassigned: { type: 'boolean' },
    reassignedCount: { type: 'integer' },
    assignmentHistory: { type: 'array', items: historyEntry },
    logs: { type: 'array', items: logEntry },
    statusHistory: { type: 'array', items: statusHistoryEntry },
  },
};

const metaLead = {
  type: 'object',
  description: 'One processed Meta lead from GET /api/leads/meta. The document is returned with queue internals removed (`rawData`, `searchText`, `processingStatus`, `attempts`, `nextAttemptAt`, `lockedAt`, `lastError`, `isDeleted`). Subdocuments still include their own `_id`. There is no GET-by-id; assignment tracks are GET /api/leads/meta/{id}/assignments.',
  properties: {
    _id: oid,
    company: oid,
    source: { type: 'string', enum: ['META'] },
    externalLeadId: { type: 'string' },
    pageId: { type: 'string' },
    pageName: { type: 'string' },
    formId: { type: 'string' },
    formName: { type: 'string' },
    campaignId: { type: 'string' },
    campaignName: { type: 'string' },
    adSetId: { type: 'string' },
    adSetName: { type: 'string' },
    adId: { type: 'string' },
    adName: { type: 'string' },
    platform: { type: 'string' },
    isOrganic: { type: 'boolean' },
    fullName: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    fields: { type: 'object', additionalProperties: true, description: 'Facebook form answers keyed by that form\'s question keys. Keys differ per form.' },
    leadCreatedAt: dateTime,
    crmLead: { nullable: true, allOf: [oid], description: 'Legacy registration id, when one was stored. Not the Innovbit client id. The client link is `convertedClient`.' },
    assignedTo: {
      type: 'object',
      nullable: true,
      description: 'Omitted when the lead has never been assigned.',
      properties: { _id: oid, name: { type: 'string' }, email: { type: 'string' } },
    },
    assignedAt: nullableDate,
    adminStatus: {
      type: 'object',
      nullable: true,
      description: 'Status set before anyone owns the lead, or the last admin status. The owner\'s status wins in `currentStatus` once an active assignment has one.',
      properties: { _id: oid, name: { type: 'string' }, color: { type: 'string' }, isConversion: { type: 'boolean' } },
    },
    adminStatusHistory: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Status changes made while the lead had no owner. Each item has `status`, `statusName`, `statusColor`, `remark`, `scheduledAt`, `rescheduled`, `changedAt`.' },
    adminStatusUpdatedAt: nullableDate,
    scheduledAt: nullableDate,
    previousSchedules: { type: 'array', items: scheduleEntry },
    rescheduledCount: { type: 'integer' },
    assignmentHistory: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Raw history subdocuments: `assignee`, `assigneeName`, `assignedAt`, `endedAt`, `byName`.' },
    isReassigned: { type: 'boolean' },
    reassignedCount: { type: 'integer' },
    isRescheduled: { type: 'boolean' },
    logs: { type: 'array', items: logEntry },
    isPriority: { type: 'boolean' },
    convertedClient: { nullable: true, allOf: [oid] },
    convertedClientName: { type: 'string' },
    convertedAt: nullableDate,
    convertedByName: { type: 'string' },
    createdAt: dateTime,
    updatedAt: dateTime,
    currentStatus: {
      ...currentStatus,
      description: 'Active owner\'s status when that assignment has one (`_id`, `name`, `color` only). Otherwise `adminStatus` (`_id`, `name`, `color`, `isConversion`). Otherwise null.',
    },
    lastActivityAt: nullableDate,
  },
};

const activityItem = {
  type: 'object',
  required: ['id', 'action', 'title', 'summary', 'message', 'remark', 'byName', 'lead'],
  properties: {
    id: { type: 'string', description: '`<leadSource>-<leadId>-<epoch ms of at>-<action>`. Stable enough to key a row. Not a database id.' },
    at: nullableDate,
    action: { type: 'string', description: 'lead_assigned, lead_reassigned, lead_unassigned, lead_status, lead_rescheduled, referral, or another stored action string.' },
    title: { type: 'string', description: 'Assigned, Reassigned, Assignment removed, Status changed, Rescheduled, Referred by a client, or the raw action.' },
    summary: { type: 'string', description: 'The line to show. Status lines look like `Status changed → Callback`. Assign lines name the person.' },
    message: { type: 'string', description: 'Raw log text. Status logs are `Status name · <local date> · remark` with the date and remark omitted when empty.' },
    remark: { type: 'string', description: 'Free-text note pulled out of a status log. Empty when the log had none.' },
    byName: { type: 'string' },
    lead: {
      type: 'object',
      properties: {
        _id: oid,
        fullName: { type: 'string' },
        phone: { type: 'string' },
        leadSource: { type: 'string', enum: ['meta', 'google', 'manual', 'import'] },
        sourceLabel: { type: 'string' },
      },
    },
    assignedTo: assigneeRef,
  },
};

const assignResult = {
  type: 'object',
  required: ['message', 'assigned', 'unchanged', 'notFound'],
  properties: {
    message: { type: 'string', example: '2 lead(s) assigned to Anita Shah' },
    assigned: { type: 'integer', description: 'Leads whose assignee actually changed.' },
    unchanged: { type: 'integer', description: 'Leads in this request that were already assigned to that person (or already unassigned).' },
    notFound: { type: 'integer', description: 'Ids that are not a visible, editable lead of this source (wrong id, deleted, outside the caller\'s write scope, or a Meta lead that is not `processed`). The HTTP status is still 200.' },
  },
};

const paging = (pageSizeName) => ([
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number. Values below 1 and non-numbers become 1.' },
  { name: pageSizeName, in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Page size. Default 20. Anything above 100 is treated as 100. The property in the JSON is documented on the response (it is not always the same name as this query).' },
]);

const priorityQuery = {
  name: 'priority',
  in: 'query',
  schema: { type: 'string', enum: ['true', 'false'] },
  description: 'Omit for every lead. `true` = `isPriority` is true. `false` = not priority (including leads saved before the flag existed). Any other non-empty value is **400** `{ "message": "Invalid filter" }` on the lists that validate it.',
};

const searchQuery = {
  name: 'search',
  in: 'query',
  schema: { type: 'string', maxLength: 100 },
  description: 'One box, max 100 characters (extra is cut, not rejected). Matches the lead\'s answers (name, phone, email, address, and other stored answers). Also matches an assignee\'s name, a status name, and a date typed as `16/10/2026`, `16-10-2026`, `2026-10-16`, `16 Oct`, `16 Oct 2026`, `Oct 2026`, a month name, `today`, or `yesterday` (India calendar, day before month). On Meta it also matches the form name and the Facebook Page name.',
};

const assignedToQuery = (extra) => ({
  name: 'assignedTo',
  in: 'query',
  schema: { type: 'string' },
  description: extra,
});

const statusIdQuery = (extra) => ({
  name: 'statusId',
  in: 'query',
  schema: { type: 'string' },
  description: extra,
});

const scheduleParams = [
  {
    name: 'schedule',
    in: 'query',
    schema: { type: 'string', enum: ['upcoming', 'today', 'overdue', 'any', 'rescheduled'] },
    description: 'Filter on the booked date. `upcoming` = today onward. `today` = this calendar day on the server. `overdue` = the date is before today. `any` = a date is set. `rescheduled` = the date was moved at least once (`rescheduledCount > 0`). Any other value is ignored, not an error.',
  },
  { name: 'scheduleFrom', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Inclusive start of `scheduledAt`, `yyyy-mm-dd`, read as the server\'s local day. Combined with `schedule`.' },
  { name: 'scheduleTo', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Inclusive end of `scheduledAt`, `yyyy-mm-dd` through 23:59:59.999 server local time.' },
];

const receivedRange = (names, dateFieldNote) => names.map((name) => ({
  name,
  in: 'query',
  schema: { type: 'string' },
  description: dateFieldNote,
}));

const statusBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['statusId'],
        properties: {
          statusId: { allOf: [oid], description: 'An **active** status id from GET /api/leads/statuses. Statuses are company-defined. The ids are not fixed.' },
          remark: { type: 'string', description: 'Optional note, cut to 1000 characters. A non-string is stored as "".' },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true, description: 'Required when that status has `requiresDate: true` (400 `Choose a date for “<name>”` when missing). Send null, "", or omit the key to clear the date when the status does not require one. An unparseable value is 400 `The date is not valid`. Saving a status without a date clears `scheduledAt`.' },
        },
      },
      example: { statusId: '665f1c2a3b4d5e6f7a8b9c11', remark: 'Call after 4pm', scheduledAt: '2026-11-30T10:30:00.000Z' },
    },
  },
};

const assignBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['leadIds'],
        properties: {
          leadIds: { type: 'array', minItems: 1, maxItems: 500, items: oid, description: 'Ids of this source. Duplicates are removed. More than 500 is 400.' },
          counsellorId: { nullable: true, allOf: [oid], description: 'Staff id from GET /api/leads/assignees. `null` unassigns. The route checks this id (or `telecallerId` when `counsellorId` is null or omitted) before the controller runs.' },
          telecallerId: { nullable: true, allOf: [oid], description: 'Alias used when `counsellorId` is omitted. Prefer `counsellorId` alone. Do not send both with different ids: the route resolves with nullish coalescing, while the controller treats a present `counsellorId` (including null) as the choice and ignores `telecallerId`.' },
        },
      },
      example: { leadIds: ['665f1c2a3b4d5e6f7a8b9c0d'], counsellorId: '665f1c2a3b4d5e6f7a8b9c22' },
    },
  },
};

const priorityBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['isPriority'],
        properties: { isPriority: { type: 'boolean', description: 'Must be a JSON boolean. The string `"true"` is 400.' } },
      },
      example: { isPriority: true },
    },
  },
};

const priorityResult = {
  type: 'object',
  required: ['_id', 'isPriority'],
  properties: { _id: oid, isPriority: { type: 'boolean' } },
};

const lock409 = messageResponse('The lead is already on the company\'s converted status, or it is already linked to a client. Status and assignment cannot change. Priority and manual field edits are not blocked by this rule.', 'This lead is converted. Its status and assignment can no longer be changed.');

const formValuesSchema = {
  type: 'object',
  required: ['name', 'phone'],
  description: 'Flat object keyed by the form\'s `key` values. Not nested under `fields`. Unknown keys are ignored. Send every field: this replaces the stored answers. An optional company field you omit is cleared.',
  properties: {
    name: { type: 'string', maxLength: 120, description: 'Required. Collapses whitespace.' },
    phone: { type: 'string', maxLength: 20, description: 'Required. Must match `^\\+?[0-9][0-9\\s-]{5,19}$`. The last 10 digits are the duplicate key, so `+91 98765 43210` and `9876543210` are the same phone.' },
    address: { type: 'string', maxLength: 2000, description: 'Optional. Omitted becomes "".' },
  },
  additionalProperties: {
    description: 'One property per company field `key`. text/textarea/phone/email/select: string. number: number (commas allowed in a string). date: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, or `DD.MM.YYYY`. yesno: boolean or Yes/No/true/false/1/0. multiselect: string array, or one string separated by commas or semicolons. select and multiselect must be one of that field\'s `options` (match is case-insensitive; the stored text is the option\'s own spelling).',
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }],
  },
};

const manualValidation = json(
  'A form field failed. `message` is the first problem. `errors` maps each form `key` to its message so the form can mark inputs. This is not the shared ValidationError shape (`error` / `details.fields`).',
  {
    type: 'object',
    required: ['message', 'errors'],
    properties: {
      message: { type: 'string' },
      errors: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
  { message: 'Name is required', errors: { name: 'Name is required' } },
);

const phoneConflict = json(
  'Another manual lead in this company already uses the same phone (last 10 digits).',
  {
    type: 'object',
    required: ['message', 'errors'],
    properties: {
      message: { type: 'string' },
      errors: { type: 'object', properties: { phone: { type: 'string' } } },
    },
  },
  { message: 'A lead with this phone number already exists (Ravi Kumar).', errors: { phone: 'Already used by another lead' } },
);

const quickCountResult = {
  type: 'object',
  required: ['unassigned'],
  properties: { unassigned: { type: 'integer', minimum: 0, description: '0 when the caller is scoped to their own leads or their team. Those callers never see unassigned leads.' } },
};

const sourceEnumNote = 'Real source keys from the quick-assign table: `meta`, `google`, `manual`.';

function op(operationId, summary, description, extra = {}) {
  return {
    tags,
    operationId,
    summary,
    description,
    security,
    ...(extra.parameters ? { parameters: extra.parameters } : {}),
    ...(extra.requestBody ? { requestBody: extra.requestBody } : {}),
    responses: extra.responses,
  };
}

function withAuth(responses) {
  return { ...responses, 401: unauthorized, 403: forbidden };
}

const listMeta = {
  type: 'object',
  required: ['leads', 'page', 'limit', 'total', 'totalPages'],
  properties: {
    leads: { type: 'array', items: metaLead },
    page: { type: 'integer' },
    limit: { type: 'integer', description: 'The page size actually used. Named `limit` here, not `pageSize`.' },
    total: { type: 'integer' },
    totalPages: { type: 'integer', description: 'At least 1, even when total is 0.' },
  },
};

const manualPage = {
  type: 'object',
  required: ['leads', 'total', 'page', 'pageSize', 'totalPages'],
  properties: {
    leads: { type: 'array', items: manualLead },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
};

const googlePage = {
  type: 'object',
  required: ['leads', 'total', 'page', 'pageSize', 'totalPages'],
  properties: {
    leads: { type: 'array', items: googleLead },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
};

const allPage = {
  type: 'object',
  required: ['leads', 'total', 'page', 'pageSize', 'totalPages'],
  properties: {
    leads: { type: 'array', items: cardLead },
    total: { type: 'integer', description: 'Matching leads across the sources included, before this page is sliced.' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
};

const perm = (line) => `**Permission:** ${line} A branch owner or company admin skips the permission check. Staff who fail it get **403** \`{ "error": "You need the “Leads › …” permission. Ask your company admin." }\` using the labels below.`;

export default {
  '/api/leads/statuses': {
    get: op(
      'leadsListStatuses',
      'List lead statuses',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`. The 403 names those three: “Leads › Assigned to them”, “Leads › View all”, “Leads › Their team”.')}

Statuses are a company-defined list. Load this before building a status picker, a board, or a status filter. Do not hard-code ids or names.

The first call for a company that has no statuses inserts, in order: New (slate), Interested (amber), Callback (blue), Site visit (purple), Converted (emerald, \`outcome: "converted"\`, \`isConversion: true\`), Lost (rose, \`outcome: "lost"\`). It also makes sure exactly one status has outcome \`converted\` and one has outcome \`lost\`. The seeded Callback and Site visit rows do **not** set \`requiresDate\`.

Staff (\`role: agent\`) receive only \`isActive: true\` rows. A branch owner or company admin also receives inactive rows. Deleted statuses are never returned. Sort is \`order\` ascending, then \`createdAt\`.

This response is a **bare array**, not \`{ data }\` and not \`{ rows, total }\`. Creating, renaming, reordering, and deleting statuses is not on \`/api/leads\`.`,
      {
        responses: withAuth({
          200: json('Active statuses for staff; active and inactive for a branch owner or company admin.', { type: 'array', items: leadStatus }, [
            { _id: '665f1c2a3b4d5e6f7a8b9c11', name: 'New', color: 'slate', order: 0, outcome: 'open', isConversion: false, requiresDate: false, isActive: true },
            { _id: '665f1c2a3b4d5e6f7a8b9c12', name: 'Converted', color: 'emerald', order: 4, outcome: 'converted', isConversion: true, requiresDate: false, isActive: true },
            { _id: '665f1c2a3b4d5e6f7a8b9c13', name: 'Lost', color: 'rose', order: 5, outcome: 'lost', isConversion: false, requiresDate: false, isActive: true },
          ]),
          500: messageResponse('The status list could not be loaded.', 'Server error retrieving lead statuses'),
        }),
      },
    ),
  },

  '/api/leads/assignees': {
    get: op(
      'leadsListAssignees',
      'List staff who can hold leads',
      `${GATE}

${perm('`leads:assign` **or** `leads:view_all`. The 403 says “Leads › Assign” or “Leads › View all”. `leads:view` alone is not enough.')}

Use this for every assignee picker (bulk assign, quick assign, and the assignee filter). The response is a **bare array** of active staff only (\`role: agent\`, \`active: true\`) whose effective permissions include \`leads:view\`, \`leads:view_all\`, or \`leads:view_team\`. Branch owners are not in this list; a lead cannot be assigned to them through these routes. Sorted by name.

Each item is \`{ _id, name, email, status }\` and \`status\` is always the string \`"active"\` (inactive staff are left out).`,
      {
        responses: withAuth({
          200: json('Staff who may be assigned a lead.', {
            type: 'array',
            items: {
              type: 'object',
              required: ['_id', 'name', 'email', 'status'],
              properties: {
                _id: oid,
                name: { type: 'string' },
                email: { type: 'string' },
                status: { type: 'string', enum: ['active'] },
              },
            },
          }, [{ _id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah', email: 'anita@example.com', status: 'active' }]),
          500: serverError,
        }),
      },
    ),
  },

  '/api/leads/form': {
    get: op(
      'leadsGetForm',
      'Get the manual lead form',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

Build the add/edit form and the import column guide from this. The array is always Name, Phone, Address, then the company\'s own fields (Manage Masters → Lead form). Company fields are whatever that company saved; this API does not define them.

Fixed fields have \`fixed: true\` and no \`help\` or \`options\`. Company fields have \`help\` (string) and \`options\` (array, empty unless the type is select or multiselect) and no \`fixed\` flag.

Response is \`{ fields }\`, not a bare array.`,
      {
        responses: withAuth({
          200: json('The form definition for this company.', {
            type: 'object',
            required: ['fields'],
            properties: { fields: { type: 'array', items: formField } },
          }, {
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true, fixed: true },
              { key: 'phone', label: 'Phone', type: 'phone', required: true, fixed: true },
              { key: 'address', label: 'Address', type: 'textarea', required: false, fixed: true },
            ],
          }),
        }),
      },
    ),
  },

  '/api/leads/all': {
    get: op(
      'leadsListAll',
      'List leads from every source',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

The combined table. Each item is the **short card** (\`card\` shape): identity, phone, assignee, priority, schedule, status, conversion. It is not the manual or Google detail, and it does not include Meta \`fields\`.

Response is \`{ leads, total, page, pageSize, totalPages }\`. \`leads\` is the page, not the full match. There is no \`rows\` key and no \`{ data }\` wrapper.

**Sort.** When \`schedule\` is one of the five known values, soonest \`scheduledAt\` first. Otherwise newest \`receivedAt\` first, then \`_id\`. Converted leads are **not** pushed to the end on this endpoint (they are on GET /api/leads/meta, /google, and /manual).

**Status for Meta rows.** The active owner\'s status wins. If that owner has not set one, the status stored on the lead (\`adminStatus\`) is used. \`statusId=none\` on this endpoint means no owner status and no admin status, and **includes unassigned** Meta leads. That is different from GET /api/leads/meta, whose \`none\` is only assigned leads that nobody has started.

**Dates.** \`from\` / \`fromDate\` and \`to\` / \`toDate\` filter when the lead was received. For Meta that is \`leadCreatedAt\`; for Google and manual it is \`createdAt\`. A \`to\` value of \`yyyy-mm-dd\` includes the whole server-local day for Meta and Google. For manual leads, \`to\` is used as that exact timestamp and does **not** extend to the end of the day — send a full ISO end if the manual rows for that day should be included.

\`pageId\` and \`formId\` apply only to the Meta portion. \`source=manual\` or \`source=import\` limits the manual portion; referrals (\`source: referral\` on the lead) are included only when \`source\` is omitted or \`manual_all\`.

A bad \`priority\` is the only filter that returns 400. An unknown \`statusId\`, \`assignedTo\`, or \`schedule\` is ignored.`,
      {
        parameters: [
          ...paging('limit'),
          {
            name: 'source',
            in: 'query',
            schema: { type: 'string' },
            description: '`meta`, `google`, `manual` (typed-in only), `import` (sheet only), or `manual_all` (typed, imported, and referral together). Omit, or send anything else, to include Meta, Google, and every manual lead. There is no `referral` value; referrals ride along with the default and with `manual_all`, and their card `sourceLabel` is "Referral".',
          },
          searchQuery,
          statusIdQuery('A status id from GET /api/leads/statuses, or `none` for "Not started". An id that is not 24 hex characters is ignored. For Meta, `none` includes unassigned leads; a real id matches the owner\'s current status, or the admin status when no owner has set one.'),
          assignedToQuery('`unassigned` (nobody assigned), `reassigned` (`isReassigned` true), or a staff user id. With a user id, `includePast=1` also returns leads that person held before. Any other value is ignored.'),
          { name: 'includePast', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'With `assignedTo` set to a user id, `1` includes leads that person held before. Ignored otherwise.' },
          priorityQuery,
          ...scheduleParams,
          ...receivedRange(['from', 'fromDate'], 'Received-on or after. `from` and `fromDate` are aliases. Unparseable values are ignored.'),
          ...receivedRange(['to', 'toDate'], 'Received-on or before. `to` and `toDate` are aliases. For Meta and Google a date-only value includes that whole server-local day. For manual leads it does not; it is the exact timestamp.'),
          { name: 'pageId', in: 'query', schema: { type: 'string' }, description: 'Meta only. Facebook Page id from GET /api/leads/meta/filters. Exact match.' },
          { name: 'formId', in: 'query', schema: { type: 'string' }, description: 'Meta only. Lead form id from GET /api/leads/meta/filters. Exact match.' },
        ],
        responses: withAuth({
          200: json('One page of short lead cards.', allPage, {
            leads: [{
              _id: '665f1c2a3b4d5e6f7a8b9c0d',
              leadSource: 'manual',
              sourceLabel: 'Added',
              fullName: 'Ravi Kumar',
              phone: '9876543210',
              address: '12 MG Road, Pune',
              receivedAt: '2026-11-20T06:30:00.000Z',
              createdAt: '2026-11-20T06:30:00.000Z',
              assignedTo: { _id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah' },
              assignedAt: '2026-11-20T07:00:00.000Z',
              isPriority: false,
              scheduledAt: null,
              rescheduledCount: 0,
              isRescheduled: false,
              isReassigned: false,
              reassignedCount: 0,
              assignmentHistory: [{ id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah', assignedAt: '2026-11-20T07:00:00.000Z', endedAt: null }],
              heldBefore: false,
              previousSchedules: [],
              currentStatus: { _id: '665f1c2a3b4d5e6f7a8b9c11', name: 'New', color: 'slate' },
              convertedClient: null,
              convertedClientName: '',
              convertedAt: null,
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          }),
          400: messageResponse('`priority` was not `true`, `false`, or empty.', 'Invalid filter'),
          500: messageResponse('The list could not be loaded.', 'Could not load leads'),
        }),
      },
    ),
  },

  '/api/leads/board': {
    get: op(
      'leadsBoard',
      'Kanban board, one column per status',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

Same lead cards and the same filters as GET /api/leads/all, with two differences: \`statusId\` is ignored (every column is filled), and \`page\` / \`limit\` are ignored.

Each source contributes at most **400** newest matching leads (soonest \`scheduledAt\` first when \`schedule\` is set, otherwise the source\'s usual newest-first query, then cut to 400). Leads beyond that cap are missing from the columns. \`truncated\` is true when any included source has more than 400 matches. \`total\` is the real match count, which can be larger than the number of cards in \`columns\`.

\`columns\` is ordered: **Not started** first (\`id: "none"\`, name "Not started", color slate, outcome open), then every status by \`order\`. An inactive or deleted status is included only while at least one of the loaded cards still sits in it. A deleted status is renamed \`"<name> (deleted)"\` and \`isActive\` is false, so the UI must not offer it as a drop target. Cards whose status id no longer exists at all are gathered in a final column \`id: "missing"\`, name "Status removed".

Inside a column, cards are newest \`receivedAt\` first. \`count\` is how many of the **loaded** cards are in that column, not the company-wide count for that status.

Response is \`{ columns, total, truncated }\`. Each card is the short card from GET /api/leads/all.`,
      {
        parameters: [
          { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Same values as GET /api/leads/all. `statusId` is not a parameter here; sending it has no effect.' },
          searchQuery,
          assignedToQuery('Same as GET /api/leads/all: `unassigned`, `reassigned`, or a user id.'),
          { name: 'includePast', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Same as GET /api/leads/all.' },
          priorityQuery,
          ...scheduleParams,
          ...receivedRange(['from', 'fromDate'], 'Same received-date rule as GET /api/leads/all.'),
          ...receivedRange(['to', 'toDate'], 'Same received-date rule as GET /api/leads/all, including the manual end-of-day difference.'),
          { name: 'pageId', in: 'query', schema: { type: 'string' }, description: 'Meta only, same as the combined list.' },
          { name: 'formId', in: 'query', schema: { type: 'string' }, description: 'Meta only, same as the combined list.' },
        ],
        responses: withAuth({
          200: json('Columns ready to render. `leads` inside each column uses the short card.', {
            type: 'object',
            required: ['columns', 'total', 'truncated'],
            properties: {
              columns: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'name', 'color', 'outcome', 'requiresDate', 'isActive', 'count', 'leads'],
                  properties: {
                    id: { type: 'string', description: '`none`, a status id, or `missing`.' },
                    name: { type: 'string' },
                    color: { type: 'string' },
                    outcome: { type: 'string', enum: ['open', 'converted', 'lost'] },
                    requiresDate: { type: 'boolean' },
                    isActive: { type: 'boolean', description: 'False on deleted, inactive, and the "Status removed" column. Do not drop a card onto those.' },
                    count: { type: 'integer' },
                    leads: { type: 'array', items: cardLead },
                  },
                },
              },
              total: { type: 'integer' },
              truncated: { type: 'boolean' },
            },
          }, {
            columns: [
              { id: 'none', name: 'Not started', color: 'slate', outcome: 'open', requiresDate: false, isActive: true, count: 0, leads: [] },
              { id: '665f1c2a3b4d5e6f7a8b9c11', name: 'New', color: 'slate', outcome: 'open', requiresDate: false, isActive: true, count: 0, leads: [] },
            ],
            total: 0,
            truncated: false,
          }),
          400: messageResponse('`priority` was not `true`, `false`, or empty.', 'Invalid filter'),
          500: messageResponse('The board could not be loaded.', 'Could not load the board'),
        }),
      },
    ),
  },

  '/api/leads/activity': {
    get: op(
      'leadsActivity',
      'Activity feed for matching leads',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

One row per log line, newest \`at\` first. Response is \`{ activities, total, page, pageSize, totalPages }\`. \`total\` counts log lines, not leads.

The lead filters match GET /api/leads/all (\`source\`, \`search\`, \`assignedTo\`, \`includePast\`, \`priority\`, \`schedule\`, \`scheduleFrom\`, \`scheduleTo\`, \`pageId\`, \`formId\`) **except** the received-date range and \`statusId\`, which filter the **log line**, not the lead\'s current status or the day it arrived:

- \`from\` / \`fromDate\` and \`to\` / \`toDate\` bound \`logs.at\`. A date-only \`to\` runs through 23:59:59.999 server local time.
- \`statusId\` set to a status id keeps lines whose action is \`lead_status\` or \`lead_rescheduled\` and whose message starts with that status\'s current name.
- \`statusId=none\` keeps lines whose action is anything **except** \`lead_status\` and \`lead_rescheduled\`.

A bad \`priority\` is **400**. Other unknown filters are ignored.`,
      {
        parameters: [
          ...paging('limit'),
          { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Same as GET /api/leads/all.' },
          searchQuery,
          statusIdQuery('Filters log lines, not the lead\'s current status. A status id, or `none` to hide status and reschedule lines. An id that is not 24 hex is ignored.'),
          assignedToQuery('Same as GET /api/leads/all. This still filters which leads contribute logs.'),
          { name: 'includePast', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Same as GET /api/leads/all.' },
          priorityQuery,
          ...scheduleParams,
          ...receivedRange(['from', 'fromDate'], 'Start of `logs.at`. Alias: `fromDate`. Unparseable values are ignored.'),
          ...receivedRange(['to', 'toDate'], 'End of `logs.at`. A date-only value includes that whole server-local day.'),
          { name: 'pageId', in: 'query', schema: { type: 'string' }, description: 'Meta leads only.' },
          { name: 'formId', in: 'query', schema: { type: 'string' }, description: 'Meta leads only.' },
        ],
        responses: withAuth({
          200: json('One page of activity rows.', {
            type: 'object',
            required: ['activities', 'total', 'page', 'pageSize', 'totalPages'],
            properties: {
              activities: { type: 'array', items: activityItem },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          }, {
            activities: [{
              id: 'manual-665f1c2a3b4d5e6f7a8b9c0d-1763618400000-lead_assigned',
              at: '2026-11-20T07:00:00.000Z',
              action: 'lead_assigned',
              title: 'Assigned',
              summary: 'Assigned to Anita Shah',
              message: 'Anita Shah',
              remark: '',
              byName: 'Branch Owner',
              lead: { _id: '665f1c2a3b4d5e6f7a8b9c0d', fullName: 'Ravi Kumar', phone: '9876543210', leadSource: 'manual', sourceLabel: 'Added' },
              assignedTo: { _id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah' },
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          }),
          400: messageResponse('`priority` was not `true`, `false`, or empty.', 'Invalid filter'),
          500: messageResponse('The feed could not be loaded.', 'Could not load activity'),
        }),
      },
    ),
  },

  '/api/leads/manual': {
    get: op(
      'leadsListManual',
      'List manual leads',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

Typed-in, imported, and referral leads. Each item is the **full manual detail** (the same object create and update return). Response is \`{ leads, total, page, pageSize, totalPages }\`.

Converted leads (status outcome \`converted\`, or the older \`isConversion\` flag) are sorted **after** every other lead. Within each group, newest \`createdAt\` first.

\`source\` here is only \`manual\` or \`import\`. Omit it to include referrals as well. There is no \`fromDate\` alias — only \`from\` and \`to\`, and \`to\` is an exact timestamp (a date-only \`to\` does not include the rest of that day).

\`schedule\` and the schedule dates apply. A bad \`priority\` is 400. A \`statusId\` or \`assignedTo\` that is not a known token or a 24-hex id is ignored.`,
      {
        parameters: [
          ...paging('limit'),
          searchQuery,
          assignedToQuery('`unassigned`, `reassigned`, or a user id. With a user id, `includePast=1` also returns leads they held before.'),
          { name: 'includePast', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Only changes the result when `assignedTo` is a user id.' },
          statusIdQuery('A status id, or `none` for leads whose `status` is null. An id that is not 24 hex is ignored.'),
          { name: 'source', in: 'query', schema: { type: 'string', enum: ['manual', 'import'] }, description: 'Omit to include manual, import, and referral. Any other value is ignored and does not filter.' },
          priorityQuery,
          ...scheduleParams,
          { name: 'from', in: 'query', schema: { type: 'string' }, description: '`createdAt` on or after this timestamp. `fromDate` is not read.' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: '`createdAt` on or before this exact timestamp. A date-only value is midnight at the start of that day, not the end.' },
        ],
        responses: withAuth({
          200: json('One page of manual leads, full detail.', manualPage, {
            leads: [],
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          }),
          400: messageResponse('`priority` was not `true`, `false`, or empty.', 'Invalid filter'),
          500: messageResponse('The list could not be loaded.', 'Could not load the leads'),
        }),
      },
    ),
    post: op(
      'leadsCreateManual',
      'Add one manual lead',
      `${GATE}

${perm('`leads:create` (“Leads › Add & import”).')}

${WHO}

Body keys are the form keys from GET /api/leads/form, flat, not nested. \`name\` and \`phone\` are required. Company fields follow that field\'s type (see the body schema).

A caller who is scoped to their own leads is stored as the assignee, so they keep the lead. A caller with \`leads:view_team\` (and not view-all) is stored as the assignee themselves, not the whole team. A caller with view-all, and a branch owner or company admin, leaves the lead unassigned.

**201** returns the full manual detail. Duplicate phone (last 10 digits) is **409**.`,
      {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: formValuesSchema, example: { name: 'Ravi Kumar', phone: '9876543210', address: '12 MG Road, Pune' } } },
        },
        responses: withAuth({
          201: json('The created lead, full detail.', manualLead, {
            _id: '665f1c2a3b4d5e6f7a8b9c0d',
            fullName: 'Ravi Kumar',
            phone: '9876543210',
            address: '12 MG Road, Pune',
            fields: {},
            source: 'manual',
            referredByClient: null,
            referredByClientName: '',
            referredByClientPhone: '',
            referredByClientEmail: '',
            createdAt: '2026-11-20T06:30:00.000Z',
            leadCreatedAt: '2026-11-20T06:30:00.000Z',
            createdByName: 'Anita Shah',
            assignedTo: { _id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah' },
            assignedAt: '2026-11-20T06:30:00.000Z',
            isPriority: false,
            convertedClient: null,
            convertedClientName: '',
            convertedAt: null,
            convertedByName: '',
            currentStatus: null,
            scheduledAt: null,
            rescheduledCount: 0,
            isRescheduled: false,
            isReassigned: false,
            reassignedCount: 0,
            assignmentHistory: [],
            logs: [],
            previousSchedules: [],
            statusHistory: [],
          }),
          400: manualValidation,
          409: phoneConflict,
          500: messageResponse('The lead could not be saved.', 'Could not add the lead'),
        }),
      },
    ),
  },

  '/api/leads/manual/template': {
    get: op(
      'leadsDownloadManualTemplate',
      'Download the manual-lead import template',
      `${GATE}

${perm('`leads:create` (“Leads › Add & import”). View permission is not enough.')}

Excel workbook (\`.xlsx\`) laid out like GET /api/leads/form.

- Sheet **Leads**: one header row, the field labels in form order (Name, Phone, Address, then company fields). No sample data row.
- Sheet **How to fill**: columns Column, Required, What to enter. The third cell names the field type, the choices for a dropdown, the date examples \`16/10/2026\` or \`2026-10-16\`, Yes or No, and the field\'s help text.

**Content-Type:** \`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\`
**Content-Disposition:** \`attachment; filename="lead-import-template.xlsx"\`
**Cache-Control:** \`no-store\`

The body is the file, not JSON.`,
      {
        responses: withAuth({
          200: {
            description: 'The .xlsx template.',
            headers: {
              'Content-Type': { schema: { type: 'string', example: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
              'Content-Disposition': { schema: { type: 'string', example: 'attachment; filename="lead-import-template.xlsx"' } },
              'Cache-Control': { schema: { type: 'string', example: 'no-store' } },
            },
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        }),
      },
    ),
  },

  '/api/leads/manual/import': {
    post: op(
      'leadsImportManual',
      'Import manual leads from a spreadsheet',
      `${GATE}

${perm('`leads:create` (“Leads › Add & import”).')}

${WHO}

**Multipart field name: \`file\`.** One file, CSV, \`.xlsx\`, or \`.xls\`, at most **5 MB**. The extension is taken from the file name.

Rate limit: **20 requests per user per 10 minutes** (\`lead-import\`). Over the limit is **429** with \`code: "RATE_LIMITED"\`, \`Retry-After\`, \`RateLimit-Limit\`, and \`RateLimit-Remaining\`. The API-wide limit (1500 per IP per 5 minutes) also applies.

The first row must be column headings. A column maps to a form field when the heading matches that field\'s label or key (any case, spaces and punctuation ignored). Name also accepts "full name", "customer name", "client name", "lead name", "contact name". Phone also accepts "phone number", "mobile", "mobile number", "contact", "whatsapp", and the same with "number" / "no". Address also accepts "full address", "location", "site address". Name and Phone columns are required or the file is rejected before any row is saved.

At most **5000** data rows. Blank rows are skipped. Each data row is checked with the same rules as POST /api/leads/manual. A row that fails validation is counted in \`rejected\` and not saved. A phone that already exists, or that appears twice in the file, increments \`duplicates\` and is skipped (it is not a rejection).

Scoped callers (own leads, or team scope) become the assignee of every imported row. View-all callers and owners leave them unassigned. \`source\` on each new lead is \`import\`.

**201** is returned even when \`imported\` is 0 (everything was a duplicate or invalid). \`rejected\` contains at most the first 100 failures; \`rejectedCount\` is the full number. \`ignoredColumns\` lists headings that matched no field. \`total\` is the number of non-blank data rows.`,
      {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'The only part. Field name must be `file`.' },
                },
              },
            },
          },
        },
        responses: withAuth({
          201: json('Import finished. Some rows may have been skipped.', {
            type: 'object',
            required: ['imported', 'duplicates', 'rejected', 'rejectedCount', 'ignoredColumns', 'total'],
            properties: {
              imported: { type: 'integer' },
              duplicates: { type: 'integer' },
              rejected: {
                type: 'array',
                maxItems: 100,
                items: {
                  type: 'object',
                  required: ['row', 'message'],
                  properties: {
                    row: { type: 'integer', description: 'Spreadsheet row number. Row 1 is the header, so the first data row is 2.' },
                    message: { type: 'string', description: 'Every field problem for that row, joined with `; `.' },
                  },
                },
              },
              rejectedCount: { type: 'integer' },
              ignoredColumns: { type: 'array', items: { type: 'string' } },
              total: { type: 'integer' },
            },
          }, { imported: 2, duplicates: 1, rejected: [{ row: 4, message: 'Phone isn\'t a valid phone number' }], rejectedCount: 1, ignoredColumns: ['Notes'], total: 4 }),
          400: json(
            'The file was missing, unreadable, larger than 5 MB, missing Name/Phone headings, or over 5000 data rows. Size and "not a spreadsheet" failures from the upload middleware use `{ error }`. The import controller uses `{ message }`.',
            { oneOf: [errorOnlySchema, messageSchema] },
            { message: 'The first row must hold the column names, including Name and Phone. Download the template to see the layout.' },
          ),
          429: rateLimited,
          500: messageResponse('The file was read but the insert failed.', 'Could not import the leads'),
        }),
      },
    ),
  },

  '/api/leads/manual/assign': {
    post: op(
      'leadsAssignManual',
      'Assign or unassign manual leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Bulk assign for manual leads only (typed, imported, and referral share this collection). Send \`leadIds\` plus \`counsellorId\`. \`null\` unassigns.

The assignee must be an active staff member returned by GET /api/leads/assignees. If not, the route answers **400** \`{ "error": "Leads can only be assigned to an active staff member whose role lets them work on leads." }\` before the controller runs. That body uses \`error\`, not \`message\`.

A scoped caller can only change leads assigned to them (or their team) right now. Other ids increase \`notFound\` and still return **200**.

If any lead that would actually change is converted (linked to a client, or on the converted status), the whole request is **409** and nothing is written. Leads already on the requested assignee are left out of that check.

**200** \`{ message, assigned, unchanged, notFound }\`.`,
      {
        requestBody: assignBody,
        responses: withAuth({
          200: json('Assign finished. Missing ids are `notFound`, not a 404.', assignResult, {
            message: '1 lead(s) assigned to Anita Shah',
            assigned: 1,
            unchanged: 0,
            notFound: 0,
          }),
          400: json('Route rejection uses `error`. The controller uses `message` (`Select at least one lead`, `You can assign up to 500 leads at a time`).', { oneOf: [errorOnlySchema, messageSchema] }, { message: 'Select at least one lead' }),
          404: messageResponse('`counsellorId` was set, but the route\'s resolved staff member does not match it.', 'Staff member not found, inactive, or not allowed to work on leads'),
          409: lock409,
          500: messageResponse('The assignment could not be saved.', 'Could not assign the leads'),
        }),
      },
    ),
  },

  '/api/leads/manual/{id}': {
    put: op(
      'leadsUpdateManual',
      'Replace a manual lead\'s form answers',
      `${GATE}

${perm('`leads:update` (“Leads › Edit & set priority”).')}

${WHO}

Same body as create. Send **every** form field. Omitted optional company fields are cleared. Name, phone, and address are replaced. Status, assignee, priority, and conversion are not changed here.

A converted lead can still be edited; the converted lock applies to status and assignment only.

An id that is not 24 hex, or a lead the caller cannot edit, is **404** \`{ "message": "Lead not found" }\`.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Manual lead id.' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: formValuesSchema, example: { name: 'Ravi Kumar', phone: '9876543210', address: '12 MG Road, Pune' } } },
        },
        responses: withAuth({
          200: json('The saved lead, full detail.', manualLead),
          400: manualValidation,
          404: messageResponse('No editable manual lead with that id in this company for this caller.', 'Lead not found'),
          409: json('Another manual lead already uses this phone.', {
            type: 'object',
            required: ['message', 'errors'],
            properties: { message: { type: 'string' }, errors: { type: 'object', additionalProperties: { type: 'string' } } },
          }, { message: 'Another lead already has this phone number (Ravi Kumar).', errors: { phone: 'Already used by another lead' } }),
          500: messageResponse('The lead could not be saved.', 'Could not save the lead'),
        }),
      },
    ),
  },

  '/api/leads/manual/{id}/status': {
    put: op(
      'leadsUpdateManualStatus',
      'Set a manual lead\'s status',
      `${GATE}

${perm('`leads:change_status` (“Leads › Change status”).')}

${WHO}

\`statusId\` must be an active status from GET /api/leads/statuses. Send \`scheduledAt\` when that status has \`requiresDate\`. A remark is optional.

When the new date differs from the date already on the lead, the old date is appended to \`previousSchedules\`, \`rescheduledCount\` increases, and the log action is \`lead_rescheduled\`. Otherwise the log action is \`lead_status\`. Omitting the date clears \`scheduledAt\`.

A converted lead (client linked, or already on the converted status) is **409**. The status is not changed.

After a **2xx**, if this lead is a portal referral, the server tells that client whether the lead is now converted or lost. The HTTP body is still the full manual lead; there is no extra referral field in the response. The client update is asynchronous and does not change this status code.

**200** returns the full manual detail, including the new \`currentStatus\`, \`statusHistory\`, and \`logs\`.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Manual lead id.' }],
        requestBody: statusBody,
        responses: withAuth({
          200: json('The lead after the status change.', manualLead),
          400: messageResponse('`statusId` missing or not an id (`Choose a status`), or the date was missing or invalid.', 'Choose a status'),
          404: messageResponse('Lead id is not 24 hex, the lead is not editable by this caller, or the status is inactive or deleted (`Status not found`).', 'Lead not found'),
          409: lock409,
          500: messageResponse('The status could not be saved.', 'Could not update the status'),
        }),
      },
    ),
  },

  '/api/leads/manual/{id}/priority': {
    put: op(
      'leadsUpdateManualPriority',
      'Set a manual lead\'s priority flag',
      `${GATE}

${perm('`leads:update` (“Leads › Edit & set priority”).')}

${WHO}

Body is \`{ "isPriority": true }\` or \`false\`. This is the only priority value.

A converted lead can still be flagged. The response is \`{ _id, isPriority }\` only, not the whole lead.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Manual lead id.' }],
        requestBody: priorityBody,
        responses: withAuth({
          200: json('The flag that was saved.', priorityResult, { _id: '665f1c2a3b4d5e6f7a8b9c0d', isPriority: true }),
          400: messageResponse('`isPriority` was missing or not a boolean.', 'Choose whether the lead is a priority'),
          404: messageResponse('Id is not 24 hex, or the lead is not editable by this caller.', 'Lead not found'),
          500: messageResponse('The flag could not be saved.', 'Server error updating the lead priority'),
        }),
      },
    ),
  },

  '/api/leads/meta': {
    get: op(
      'leadsListMeta',
      'List Meta leads',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

Processed Meta leads only (\`processingStatus: "processed"\`, not deleted). Each item is the **Meta detail** described in the schema (form answers in \`fields\`, page and form names, campaign fields, both \`adminStatus\` and \`currentStatus\`). Response is \`{ leads, page, limit, total, totalPages }\`. The page-size query is \`limit\`, and the JSON property is also \`limit\` (not \`pageSize\`).

Converted leads are sorted last. Otherwise newest \`leadCreatedAt\` first.

**\`statusId=none\`** means the lead is assigned, the owner\'s current status is empty, and \`adminStatus\` is also empty. Unassigned leads are **not** in \`none\` on this endpoint. Use GET /api/leads/all if "Not started" should include unassigned Meta leads. A real status id matches the owner\'s current status, or \`adminStatus\` when no owner has set a status.

**\`from\` and \`to\` are validated and then not applied.** An unparseable value is **400** \`{ "message": "Invalid date filter" }\`. A valid value does not filter the list: the session-range helper this handler calls always returns no range. Filter Meta leads by received date on GET /api/leads/all, which does apply \`from\` / \`to\`.

This list has no \`schedule\`, \`reassigned\`, or \`includePast\` filter. \`assignedTo=unassigned\` means the \`assignedTo\` field is absent (a cleared assignment), not the string stored as null. A bad \`assignedTo\`, \`statusId\`, or \`priority\` is **400** \`{ "message": "Invalid filter" }\`.`,
      {
        parameters: [
          ...paging('limit'),
          searchQuery,
          { name: 'formId', in: 'query', schema: { type: 'string' }, description: 'Exact Facebook form id from GET /api/leads/meta/filters.' },
          { name: 'pageId', in: 'query', schema: { type: 'string' }, description: 'Exact Facebook Page id from GET /api/leads/meta/filters.' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Checked as a date, then ignored. See the description.' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: 'Checked as a date, then ignored. See the description.' },
          assignedToQuery('`unassigned`, or a user id. Anything else is 400. `reassigned` is not a special value here; it is 400.'),
          statusIdQuery('A status id, or `none` (assigned and not started, and no admin status). Anything else is 400.'),
          priorityQuery,
        ],
        responses: withAuth({
          200: json('One page of Meta leads.', listMeta, { leads: [], page: 1, limit: 20, total: 0, totalPages: 1 }),
          400: messageResponse('Bad `assignedTo`, `statusId`, `priority`, or an unparseable `from` / `to`.', 'Invalid filter'),
          500: messageResponse('The list could not be loaded. The key is `message`.', 'Server error retrieving Meta leads'),
        }),
      },
    ),
  },

  '/api/leads/meta/filters': {
    get: op(
      'leadsMetaFilters',
      'List Meta pages and forms that have leads',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

Page and form ids to put in the Meta filter dropdowns (\`pageId\`, \`formId\` on GET /api/leads/meta and on the combined list). Built from processed, non-deleted Meta leads.

This query is **not** limited to the caller\'s own leads. A scoped staff member can see page and form names for the whole company. The lead list itself is still scoped.

Response is \`{ pages, forms }\`. \`pageName\` falls back to the page id when the lead stored no name. Same for \`formName\`.`,
      {
        responses: withAuth({
          200: json('Distinct pages and forms.', {
            type: 'object',
            required: ['pages', 'forms'],
            properties: {
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['pageId', 'pageName'],
                  properties: { pageId: { type: 'string' }, pageName: { type: 'string' } },
                },
              },
              forms: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['formId', 'formName', 'pageId'],
                  properties: { formId: { type: 'string' }, formName: { type: 'string' }, pageId: { type: 'string' } },
                },
              },
            },
          }, {
            pages: [{ pageId: '1234567890', pageName: 'Innovbit Solar' }],
            forms: [{ formId: '9876543210', formName: 'Rooftop enquiry', pageId: '1234567890' }],
          }),
          500: messageResponse('The filter lists could not be loaded.', 'Server error retrieving Meta lead filters'),
        }),
      },
    ),
  },

  '/api/leads/meta/{id}/assignments': {
    get: op(
      'leadsMetaAssignments',
      'Status track of each person who held a Meta lead',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

Meta only. Each assignment is one person\'s own status history for this lead. The active row (\`isActive: true\`) is the current owner and is listed first, then most recently assigned.

The response is a **bare array**. It can be empty. A view-all caller (or a branch owner or company admin) who passes a 24-hex id that is not a lead still gets **200** \`[]\`, not 404. A scoped caller gets **404** when that lead is outside the leads they are allowed to see, including a bad id.

\`currentStatus.requiresDate\` in this payload is not reliable (the query does not load that flag, so it comes back false). Use GET /api/leads/statuses. \`history\` items do not include the status id, only the name and color copied at the time.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Meta lead id.' }],
        responses: withAuth({
          200: json('Every assignment on this lead, active first. A bare array.', {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                _id: oid,
                telecaller: { type: 'object', nullable: true, properties: { _id: oid, name: { type: 'string' }, email: { type: 'string' } } },
                assignedBy: { type: 'object', nullable: true, properties: { _id: oid, name: { type: 'string' } } },
                assignedAt: dateTime,
                endedAt: nullableDate,
                isActive: { type: 'boolean' },
                currentStatus: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    _id: oid,
                    name: { type: 'string' },
                    color: { type: 'string' },
                    isConversion: { type: 'boolean' },
                    requiresDate: { type: 'boolean', description: 'Always false in this payload. Read the flag from GET /api/leads/statuses.' },
                  },
                },
                history: { type: 'array', items: statusHistoryEntry },
                lastActivityAt: nullableDate,
              },
            },
          }, []),
          404: messageResponse('Scoped caller, and this id is not a Meta lead they can see. Also returned when the id is not 24 hex.', 'Lead not found'),
          500: messageResponse('The history could not be loaded.', 'Server error retrieving lead assignments'),
        }),
      },
    ),
  },

  '/api/leads/meta/{id}/status': {
    put: op(
      'leadsUpdateMetaStatus',
      'Set a Meta lead\'s status',
      `${GATE}

${perm('`leads:change_status` (“Leads › Change status”).')}

${WHO}

Same body as the other status routes: \`statusId\`, optional \`remark\`, optional \`scheduledAt\`. The status must be active.

If someone currently owns the lead, the status is stored on that assignment and \`storedOn\` is \`"assignment"\`. If nobody owns it, the status is stored on the lead (\`adminStatus\`) and \`storedOn\` is \`"lead"\` with \`assignmentId: null\`. The list\'s \`currentStatus\` follows that same rule.

A converted lead is **409**. An inactive status is **400** \`This status is no longer available\` (not 404). A bad lead id or a lead outside the write scope is **404**.

The response is the status track, not the whole lead.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Meta lead id.' }],
        requestBody: statusBody,
        responses: withAuth({
          200: json('Where the status was stored, and the history to show.', {
            type: 'object',
            required: ['assignmentId', 'storedOn', 'currentStatus', 'history', 'lastActivityAt'],
            properties: {
              assignmentId: { nullable: true, allOf: [oid] },
              storedOn: { type: 'string', enum: ['assignment', 'lead'] },
              currentStatus,
              history: { type: 'array', items: statusHistoryEntry },
              lastActivityAt: nullableDate,
            },
          }, {
            assignmentId: '665f1c2a3b4d5e6f7a8b9c44',
            storedOn: 'assignment',
            currentStatus: { _id: '665f1c2a3b4d5e6f7a8b9c11', name: 'New', color: 'slate', isConversion: false, requiresDate: false },
            history: [{ statusName: 'New', statusColor: 'slate', remark: '', scheduledAt: null, rescheduled: false, changedAt: '2026-11-20T08:00:00.000Z' }],
            lastActivityAt: '2026-11-20T08:00:00.000Z',
          }),
          400: messageResponse('`Select a status`, `This status is no longer available`, `Choose a date for “…”`, or `The date is not valid`.', 'Select a status'),
          404: messageResponse('Lead id is not 24 hex, or the lead is not editable by this caller.', 'Lead not found'),
          409: lock409,
          500: messageResponse('The status could not be saved.', 'Server error updating the lead status'),
        }),
      },
    ),
  },

  '/api/leads/meta/{id}/priority': {
    put: op(
      'leadsUpdateMetaPriority',
      'Set a Meta lead\'s priority flag',
      `${GATE}

${perm('`leads:update` (“Leads › Edit & set priority”).')}

${WHO}

Body \`{ "isPriority": true|false }\`. Response \`{ _id, isPriority }\`. A converted Meta lead can still be flagged. The write scope applies.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Meta lead id.' }],
        requestBody: priorityBody,
        responses: withAuth({
          200: json('The flag that was saved.', priorityResult, { _id: '665f1c2a3b4d5e6f7a8b9c0d', isPriority: true }),
          400: messageResponse('`isPriority` was missing or not a boolean.', 'Choose whether the lead is a priority'),
          404: messageResponse('Id is not 24 hex, or the lead is not an editable Meta lead for this caller.', 'Lead not found'),
          500: messageResponse('The flag could not be saved.', 'Server error updating the lead priority'),
        }),
      },
    ),
  },

  '/api/leads/meta/assign': {
    post: op(
      'leadsAssignMeta',
      'Assign or unassign Meta leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Same body as manual assign: \`leadIds\` and \`counsellorId\` (\`null\` unassigns). Only processed, non-deleted Meta leads in the caller\'s write scope are found. The assignee check is the same **400** \`{ "error" }\` from the route.

Assigning writes a per-person status track: the previous owner\'s track is closed, and the new owner gets their own (a person who held the lead before gets their earlier track back). Google and manual assign do not create that track.

**200** \`{ message, assigned, unchanged, notFound }\`. A converted lead that would change assignee fails the whole request with **409**. Two people assigning the same lead at once can return **409** \`These leads were just changed by someone else. Please try again.\``,
      {
        requestBody: assignBody,
        responses: withAuth({
          200: json('Assign finished.', assignResult, { message: '1 lead(s) assigned to Anita Shah', assigned: 1, unchanged: 0, notFound: 0 }),
          400: json('Route `{ error }` when the assignee cannot hold leads. Controller `{ message }` when `leadIds` is empty, an id is not 24 hex, there are more than 500, or the counsellor id is not 24 hex (`Invalid counsellor`).', { oneOf: [errorOnlySchema, messageSchema] }, { message: 'Select at least one lead' }),
          404: messageResponse('The counsellor id did not match the staff member the route resolved.', 'Staff member not found, inactive, or not allowed to work on leads'),
          409: json('Converted lead, or a concurrent assign.', messageSchema, { message: 'This lead is converted. Its status and assignment can no longer be changed.' }),
          500: messageResponse('The assignment could not be saved.', 'Server error assigning leads'),
        }),
      },
    ),
  },

  '/api/leads/google': {
    get: op(
      'leadsListGoogle',
      'List Google Ads leads',
      `${GATE}

${perm('`leads:view`, or `leads:view_all`, or `leads:view_team`.')}

${WHO}

Each item is the **Google detail** (answers in \`fields\`, status history, logs, assignment history). Response is \`{ leads, total, page, pageSize, totalPages }\`.

The page-size query is \`limit\`. \`pageSize\` is accepted as an alias for that query. The JSON property is \`pageSize\`.

Converted leads are last. Otherwise newest \`createdAt\` first.

\`statusId\` and \`status\` are aliases. \`none\` means the status field is null. \`from\` / \`fromDate\` and \`to\` / \`toDate\` filter \`createdAt\`; a date-only \`to\` includes the whole server-local day. There is no \`schedule\`, \`reassigned\`, or \`includePast\` filter. A bad \`priority\` is 400. A bad assignee or status id is ignored, not 400.`,
      {
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number. Below 1 becomes 1.' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Page size. `pageSize` is an alias. Default 20, max 100.' },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 }, description: 'Alias of `limit`. `limit` wins when both are sent, because `limit` is read first.' },
          searchQuery,
          assignedToQuery('`unassigned`, or a user id. Other values are ignored.'),
          statusIdQuery('A status id, or `none`. Alias query name: `status`. An id that is not 24 hex is ignored.'),
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Alias of `statusId`, used only when `statusId` is omitted.' },
          priorityQuery,
          ...receivedRange(['from', 'fromDate'], 'Alias pair. `fromDate` is used when `from` is empty. Filters `createdAt`.'),
          ...receivedRange(['to', 'toDate'], 'Alias pair. A date-only `to` includes that whole server-local day.'),
        ],
        responses: withAuth({
          200: json('One page of Google Ads leads, full detail.', googlePage, { leads: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }),
          400: messageResponse('`priority` was not `true`, `false`, or empty.', 'Invalid filter'),
          500: messageResponse('The list could not be loaded.', 'Server error loading Google Ads leads'),
        }),
      },
    ),
  },

  '/api/leads/google/{id}/status': {
    put: op(
      'leadsUpdateGoogleStatus',
      'Set a Google Ads lead\'s status',
      `${GATE}

${perm('`leads:change_status` (“Leads › Change status”).')}

${WHO}

Same status body as the other sources. An id that is not 24 hex is **400** \`Invalid lead\` (the other sources use 404 for that). An inactive or unknown status is **404** \`Status not found\`. A missing date on a \`requiresDate\` status is **400**.

A converted lead is **409**. **200** is \`{ message, statusName }\` only — reload the list (or trust \`statusName\`) to refresh the row. The full lead is not returned.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Google lead id. A non-id is 400, not 404.' }],
        requestBody: statusBody,
        responses: withAuth({
          200: json('Status saved.', {
            type: 'object',
            required: ['message', 'statusName'],
            properties: { message: { type: 'string' }, statusName: { type: 'string' } },
          }, { message: 'Status updated', statusName: 'New' }),
          400: messageResponse('`Invalid lead`, `Choose a status`, or a date error (`Choose a date for “…”` / `The date is not valid`).', 'Choose a status'),
          404: messageResponse('Status inactive or unknown, or the lead is not editable by this caller.', 'Lead not found'),
          409: lock409,
          500: messageResponse('The status could not be saved.', 'Server error updating Google Ads lead status'),
        }),
      },
    ),
  },

  '/api/leads/google/{id}/priority': {
    put: op(
      'leadsUpdateGooglePriority',
      'Set a Google Ads lead\'s priority flag',
      `${GATE}

${perm('`leads:update` (“Leads › Edit & set priority”).')}

${WHO}

Body \`{ "isPriority": true|false }\`. Response \`{ _id, isPriority }\`. Converted leads can still be flagged.`,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: oid, description: 'Google lead id.' }],
        requestBody: priorityBody,
        responses: withAuth({
          200: json('The flag that was saved.', priorityResult, { _id: '665f1c2a3b4d5e6f7a8b9c0d', isPriority: false }),
          400: messageResponse('`isPriority` was missing or not a boolean.', 'Choose whether the lead is a priority'),
          404: messageResponse('Id is not 24 hex, or the lead is not editable by this caller.', 'Lead not found'),
          500: messageResponse('The flag could not be saved.', 'Server error updating the lead priority'),
        }),
      },
    ),
  },

  '/api/leads/google/assign': {
    post: op(
      'leadsAssignGoogle',
      'Assign or unassign Google Ads leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Same body and same \`{ message, assigned, unchanged, notFound }\` result as manual assign. \`counsellorId: null\` unassigns. The route\'s assignee check returns **400** \`{ "error" }\`. A converted lead that would change assignee fails the whole request with **409**.`,
      {
        requestBody: assignBody,
        responses: withAuth({
          200: json('Assign finished.', assignResult, { message: '1 lead(s) unassigned', assigned: 1, unchanged: 0, notFound: 0 }),
          400: json('Route `{ error }` for a bad assignee. Controller `{ message }` for empty `leadIds`, more than 500, or a counsellor id that is not 24 hex.', { oneOf: [errorOnlySchema, messageSchema] }, { error: 'Leads can only be assigned to an active staff member whose role lets them work on leads.' }),
          404: messageResponse('The counsellor id did not match the staff member the route resolved.', 'Staff member not found, inactive, or not allowed to work on leads'),
          409: lock409,
          500: messageResponse('The assignment could not be saved.', 'Server error assigning Google Ads leads'),
        }),
      },
    ),
  },

  '/api/leads/all/unassigned-count': {
    get: op(
      'leadsUnassignedCountAll',
      'Count unassigned leads across sources',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

How many leads quick-assign can hand out. A scoped caller (no \`leads:view_all\`, and not a branch owner or company admin) always receives \`{ "unassigned": 0 }\` without counting.

A lead counts when it is not deleted, \`assignedTo\` is null, \`convertedClient\` is null, and neither \`status\` nor \`adminStatus\` is the company\'s converted status. Meta leads must also be \`processed\`.

\`sources\` defaults to \`meta,google,manual\`. ${sourceEnumNote} Unknown tokens are dropped. If nothing valid remains, the count is 0.

Response is \`{ unassigned }\` only.`,
      {
        parameters: [{
          name: 'sources',
          in: 'query',
          schema: { type: 'string', example: 'meta,google' },
          description: 'Comma-separated subset of `meta`, `google`, `manual`. Omit for all three.',
        }],
        responses: withAuth({
          200: json('How many unassigned leads match.', quickCountResult, { unassigned: 12 }),
          500: serverError,
        }),
      },
    ),
  },

  '/api/leads/all/assign-unassigned': {
    post: op(
      'leadsAssignUnassignedAll',
      'Quick-assign the oldest unassigned leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Hands the oldest unassigned leads to one staff member, across the chosen sources, without ticking boxes. The caller must not be scoped (view-all, or branch owner, or company admin); a scoped caller has no unassigned leads and gets **400** \`There are no unassigned leads in the sources you chose\`.

Body: \`count\` (integer 1–500), \`counsellorId\` (required; the route rejects a missing assignee), and optional \`sources\` (comma-separated string or an array of \`meta\`, \`google\`, \`manual\`). If \`sources\` is also in the query, the body wins. Omit \`sources\` for all three.

Oldest first. Meta uses \`leadCreatedAt\`, Google and manual use \`createdAt\`. Ties break by source name (\`google\`, then \`manual\`, then \`meta\`).

The picked ids are then sent through each source\'s normal assign handler, in order **meta, google, manual**. Success is **200** \`{ "assigned": <count> }\` — not the per-source \`{ message, assigned, unchanged, notFound }\`.

If a later source fails, earlier sources stay assigned. The response is that failure\'s status with \`{ "error": "<the handler message>" }\` (the key is \`error\` here, even when the handler said \`message\`).`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['count', 'counsellorId'],
                properties: {
                  count: { type: 'integer', minimum: 1, maximum: 500 },
                  counsellorId: oid,
                  telecallerId: { allOf: [oid], description: 'Alias read by the assignee check when `counsellorId` is omitted.' },
                  sources: {
                    description: 'Subset of meta, google, manual. String (`"meta,google"`) or array. Omit for all three.',
                    oneOf: [
                      { type: 'string' },
                      { type: 'array', items: { type: 'string', enum: ['meta', 'google', 'manual'] } },
                    ],
                  },
                },
              },
              example: { count: 10, counsellorId: '665f1c2a3b4d5e6f7a8b9c22', sources: 'meta,google' },
            },
          },
        },
        parameters: [{
          name: 'sources',
          in: 'query',
          schema: { type: 'string' },
          description: 'Used only when the body has no `sources`. Same comma-separated keys.',
        }],
        responses: withAuth({
          200: json('All picked leads were assigned. `assigned` equals `count`.', {
            type: 'object',
            required: ['assigned'],
            properties: { assigned: { type: 'integer' } },
          }, { assigned: 10 }),
          400: json('Validation uses `{ error }`. Examples: `Choose at least one lead source`, `Choose the staff member`, `Enter how many leads to assign (1 or more)`, `You can assign up to 500 leads at a time`, `Only 3 leads are unassigned`, `There are no unassigned leads in the sources you chose`. A bad assignee uses the same key.', errorOnlySchema, { error: 'Enter how many leads to assign (1 or more)' }),
          409: json('A picked lead was converted before it could be assigned. Sources earlier in meta → google → manual may already have been assigned.', errorOnlySchema, { error: 'This lead is converted. Its status and assignment can no longer be changed.' }),
          500: json('A source assign handler failed without its own status, or the caught error had no message.', errorOnlySchema, { error: 'Could not assign leads' }),
        }),
      },
    ),
  },

  '/api/leads/meta/unassigned-count': {
    get: op(
      'leadsUnassignedCountMeta',
      'Count unassigned Meta leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

${sourceEnumNote} This path is the Meta one.

Counts processed, not deleted Meta leads with no assignee, no linked client, and a status that is not the converted status (both the owner/admin status fields). A scoped caller gets 0. Response \`{ unassigned }\`.`,
      {
        responses: withAuth({
          200: json('Unassigned processed Meta leads.', quickCountResult, { unassigned: 4 }),
          500: serverError,
        }),
      },
    ),
  },

  '/api/leads/google/unassigned-count': {
    get: op(
      'leadsUnassignedCountGoogle',
      'Count unassigned Google Ads leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Not deleted, no assignee, no linked client, status not converted. A scoped caller gets 0. Response \`{ unassigned }\`.`,
      {
        responses: withAuth({
          200: json('Unassigned Google Ads leads.', quickCountResult, { unassigned: 2 }),
          500: serverError,
        }),
      },
    ),
  },

  '/api/leads/manual/unassigned-count': {
    get: op(
      'leadsUnassignedCountManual',
      'Count unassigned manual leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Typed, imported, and referral leads together. Not deleted, no assignee, no linked client, status not converted. A scoped caller gets 0. Response \`{ unassigned }\`.`,
      {
        responses: withAuth({
          200: json('Unassigned manual leads.', quickCountResult, { unassigned: 6 }),
          500: serverError,
        }),
      },
    ),
  },

  '/api/leads/meta/assign-unassigned': {
    post: op(
      'leadsAssignUnassignedMeta',
      'Quick-assign the oldest unassigned Meta leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Picks the oldest \`count\` unassigned processed Meta leads (\`leadCreatedAt\` ascending, then \`_id\`) and runs the Meta assign handler. Body is \`count\` plus \`counsellorId\`. There is no \`sources\` field on this path.

**200** is the Meta assign result \`{ message, assigned, unchanged, notFound }\`, not \`{ assigned }\` alone. The route\'s own validation errors use \`{ error }\`. The handler\'s errors use \`{ message }\` and the handler\'s status (400, 404, 409, 500).

\`count\` must be an integer from 1 to 500. If \`count\` is greater than the number waiting, **400** \`{ "error": "Only N leads are unassigned" }\` (or "lead is" when N is 1). None waiting: \`There are no unassigned leads\`.`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['count', 'counsellorId'],
                properties: { count: { type: 'integer', minimum: 1, maximum: 500 }, counsellorId: oid, telecallerId: oid },
              },
              example: { count: 5, counsellorId: '665f1c2a3b4d5e6f7a8b9c22' },
            },
          },
        },
        responses: withAuth({
          200: json('Meta assign result for the leads that were picked.', assignResult, { message: '5 lead(s) assigned to Anita Shah', assigned: 5, unchanged: 0, notFound: 0 }),
          400: json('Route `{ error }` for count, assignee, or not enough unassigned leads. Handler `{ message }` if the rewritten `leadIds` fail its checks.', { oneOf: [errorOnlySchema, messageSchema] }, { error: 'Only 2 leads are unassigned' }),
          404: messageResponse('Assignee could not be resolved.', 'Staff member not found, inactive, or not allowed to work on leads'),
          409: lock409,
          500: messageResponse('The Meta assign handler failed.', 'Server error assigning leads'),
        }),
      },
    ),
  },

  '/api/leads/google/assign-unassigned': {
    post: op(
      'leadsAssignUnassignedGoogle',
      'Quick-assign the oldest unassigned Google Ads leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Same contract as POST /api/leads/meta/assign-unassigned, for Google leads. Oldest by \`createdAt\`, then \`_id\`. **200** is \`{ message, assigned, unchanged, notFound }\` from the Google assign handler. Route validation uses \`{ error }\`.`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['count', 'counsellorId'],
                properties: { count: { type: 'integer', minimum: 1, maximum: 500 }, counsellorId: oid, telecallerId: oid },
              },
              example: { count: 5, counsellorId: '665f1c2a3b4d5e6f7a8b9c22' },
            },
          },
        },
        responses: withAuth({
          200: json('Google assign result for the leads that were picked.', assignResult, { message: '5 lead(s) assigned to Anita Shah', assigned: 5, unchanged: 0, notFound: 0 }),
          400: json('Route `{ error }` or handler `{ message }`.' , { oneOf: [errorOnlySchema, messageSchema] }, { error: 'Choose the staff member' }),
          404: messageResponse('Assignee could not be resolved.', 'Staff member not found, inactive, or not allowed to work on leads'),
          409: lock409,
          500: messageResponse('The Google assign handler failed.', 'Server error assigning Google Ads leads'),
        }),
      },
    ),
  },

  '/api/leads/manual/assign-unassigned': {
    post: op(
      'leadsAssignUnassignedManual',
      'Quick-assign the oldest unassigned manual leads',
      `${GATE}

${perm('`leads:assign` (“Leads › Assign”).')}

${WHO}

Same contract as the Meta quick-assign, for manual leads (typed, imported, and referral together). Oldest by \`createdAt\`, then \`_id\`. **200** is \`{ message, assigned, unchanged, notFound }\`. Route validation uses \`{ error }\`.`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['count', 'counsellorId'],
                properties: { count: { type: 'integer', minimum: 1, maximum: 500 }, counsellorId: oid, telecallerId: oid },
              },
              example: { count: 5, counsellorId: '665f1c2a3b4d5e6f7a8b9c22' },
            },
          },
        },
        responses: withAuth({
          200: json('Manual assign result for the leads that were picked.', assignResult, { message: '5 lead(s) assigned to Anita Shah', assigned: 5, unchanged: 0, notFound: 0 }),
          400: json('Route `{ error }` or handler `{ message }`.', { oneOf: [errorOnlySchema, messageSchema] }, { error: 'There are no unassigned leads' }),
          404: messageResponse('Assignee could not be resolved.', 'Staff member not found, inactive, or not allowed to work on leads'),
          409: lock409,
          500: messageResponse('The manual assign handler failed.', 'Could not assign the leads'),
        }),
      },
    ),
  },

  '/api/leads/{source}/{id}/converted': {
    put: op(
      'leadsConvertToClient',
      'Link a converted lead to an existing client',
      `${GATE}

${perm('`leads:change_status` (“Leads › Change status”).')}

${WHO}

This does **not** create the client. Create the client first, then send its id. \`source\` is exactly \`meta\`, \`google\`, or \`manual\`. Any other source is **404** \`{ "error": "Not found" }\`.

The lead must already be on the company status whose \`outcome\` is \`converted\`. For Meta, that is the active owner\'s \`currentStatus\`, or \`adminStatus\` when nobody owns it. \`isConversion\` alone is not enough for this check. If it is not that status, **400** \`{ "error": "Set the lead to your converted status first" }\`.

The client must belong to this company. Otherwise **400** \`{ "error": "Client not found" }\`. A bad lead id, or a lead outside the write scope, is **404** \`{ "error": "Lead not found" }\`. Linking a second time is **409** \`{ "error": "This lead was already converted to <name>" }\`.

These bodies use \`error\`, not \`message\`.

**200** returns only the link that was saved: \`{ convertedClient, convertedClientName, convertedAt, convertedByName }\`. \`convertedByName\` is the caller\'s name, or their email when they have no name.`,
      {
        parameters: [
          { name: 'source', in: 'path', required: true, schema: { type: 'string', enum: ['meta', 'google', 'manual'] }, description: 'Which lead collection. Any other value is 404.' },
          { name: 'id', in: 'path', required: true, schema: oid, description: 'Lead id in that source. A non-id is 404.' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: { clientId: { allOf: [oid], description: 'Client that was just created from this lead. Must belong to this company.' } },
              },
              example: { clientId: '665f1c2a3b4d5e6f7a8b9c33' },
            },
          },
        },
        responses: withAuth({
          200: json('The link stored on the lead. Not a client object.', {
            type: 'object',
            required: ['convertedClient', 'convertedClientName', 'convertedAt', 'convertedByName'],
            properties: {
              convertedClient: oid,
              convertedClientName: { type: 'string' },
              convertedAt: dateTime,
              convertedByName: { type: 'string' },
            },
          }, {
            convertedClient: '665f1c2a3b4d5e6f7a8b9c33',
            convertedClientName: 'Ravi Kumar',
            convertedAt: '2026-11-23T08:00:00.000Z',
            convertedByName: 'Anita Shah',
          }),
          400: json('Client missing, or the lead is not on the converted outcome.', errorOnlySchema, { error: 'Set the lead to your converted status first' }),
          404: json('Unknown source, bad lead id, or the lead is not in the caller\'s write scope.', errorOnlySchema, { error: 'Lead not found' }),
          409: json('This lead already has `convertedClient`.', errorOnlySchema, { error: 'This lead was already converted to Ravi Kumar' }),
          500: serverError,
        }),
      },
    ),
  },

  '/api/leads/export': {
    get: op(
      'leadsExport',
      'Download every visible lead as Excel or CSV',
      `${GATE}

${perm('`leads:export` (“Leads › Export”).')}

${WHO}

Downloads **all** leads this caller is allowed to see. The only query is \`format\`. Search, status, assignee, and dates on the list screens are **not** applied. Cap is 50,000 leads after the three sources are merged, newest received first.

Rate limit: **20 exports per user per hour**. Over the limit is **429** (\`code: "RATE_LIMITED"\`, \`Retry-After\`).

\`format=csv\` returns CSV. Anything else, including omitting \`format\`, returns \`.xlsx\`.

Columns, in order: Source, Name, Phone, Email, Address, Received, Status, Assigned to, then one column per company lead-form field (manual answers only; header is the field label), then **Other answers** only when at least one Meta or Google lead has an answer that is not name, phone, email, or address. Source cells are Meta, Google Ads, Added, Imported. Received is \`YYYY-MM-DD HH:mm\` in Asia/Kolkata. Status is the status name (for Meta, the owner\'s status, otherwise the admin status). Assigned to is the person\'s name.

**Cache-Control:** \`no-store\`. The body is the file, not JSON. A failure is **500** \`{ "message": "Could not export leads" }\`.`,
      {
        parameters: [{
          name: 'format',
          in: 'query',
          schema: { type: 'string', enum: ['xlsx', 'csv'], default: 'xlsx' },
          description: 'Only the exact value `csv` selects CSV. Every other value, including omission, is Excel.',
        }],
        responses: withAuth({
          200: {
            description: 'The file. Excel unless `format=csv`.',
            headers: {
              'Content-Disposition': { schema: { type: 'string' }, description: '`attachment; filename="leads-YYYY-MM-DD.xlsx"` or `.csv`.' },
              'Cache-Control': { schema: { type: 'string', example: 'no-store' } },
            },
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } },
              'text/csv': { schema: { type: 'string', format: 'binary' }, example: 'Source,Name,Phone,Email,Address,Received,Status,Assigned to\r\nAdded,Ravi Kumar,9876543210,,,2026-11-20 12:00,,\r\n' },
            },
          },
          429: rateLimited,
          500: messageResponse('The file could not be built.', 'Could not export leads'),
        }),
      },
    ),
  },

  '/api/leads/reports/telecallers': {
    get: op(
      'leadsTelecallerReport',
      'Staff performance on lead assignments',
      `${GATE}

**Permission:** not a \`leads:*\` string. \`requireRole('branch', 'company')\` — branch owner or company admin only. Staff, including staff with \`leads:view_all\`, get **403** \`{ "error": "You do not have access to this area" }\`.

Per-person numbers come from Meta assignment rows (the track POST /api/leads/meta/assign writes). Manual assign and Google assign in this API update the lead document only, so those leads do **not** appear in \`telecallers\`. \`totalLeads\` and \`unassignedLeads\` add processed Meta leads, manual leads, and legacy website leads. Google Ads leads are not in either total.

\`from\` and \`to\` are read and rejected when they are not dates (**400** \`Invalid date filter\`), then **not applied**. The range helper returns no range, so the report is not date-filtered.

Each \`telecallers\` item is one staff member who can hold leads, plus anyone who already has assignment rows (including inactive). \`user.status\` is \`active\` or \`inactive\`. \`conversionRate\` is one decimal percent (\`converted / totalAssigned * 100\`, rounded to 0.1) or 0 when \`totalAssigned\` is 0. \`statuses\` is the count of that person\'s current status per status, sorted by \`order\`.

Response is \`{ totalLeads, unassignedLeads, telecallers }\`.`,
      {
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Validated as a date. Not applied to the totals.' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: 'Validated as a date. Not applied to the totals. Not extended to end of day, because it is not applied.' },
        ],
        responses: withAuth({
          200: json('Company totals plus one row per staff member.', {
            type: 'object',
            required: ['totalLeads', 'unassignedLeads', 'telecallers'],
            properties: {
              totalLeads: { type: 'integer', description: 'Processed Meta + manual + website. Does not include Google Ads.' },
              unassignedLeads: { type: 'integer', description: 'Same three collections, where `assignedTo` is missing or null.' },
              telecallers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        _id: oid,
                        name: { type: 'string' },
                        email: { type: 'string' },
                        status: { type: 'string', enum: ['active', 'inactive'] },
                      },
                    },
                    totalAssigned: { type: 'integer' },
                    activeLeads: { type: 'integer', description: 'Assignment rows still active.' },
                    reassignedAway: { type: 'integer', description: 'Assignment rows that were closed.' },
                    workedLeads: { type: 'integer', description: 'Rows whose status history is not empty.' },
                    notStarted: { type: 'integer', description: 'Active rows with an empty status history.' },
                    converted: { type: 'integer', description: 'Rows whose current status is a conversion status.' },
                    conversionRate: { type: 'number', description: 'One decimal percent.' },
                    statusUpdates: { type: 'integer', description: 'Sum of history lengths.' },
                    lastActivityAt: nullableDate,
                    statuses: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          statusId: oid,
                          name: { type: 'string' },
                          color: { type: 'string' },
                          order: { type: 'integer' },
                          count: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          }, {
            totalLeads: 40,
            unassignedLeads: 12,
            telecallers: [{
              user: { _id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah', email: 'anita@example.com', status: 'active' },
              totalAssigned: 8,
              activeLeads: 6,
              reassignedAway: 2,
              workedLeads: 5,
              notStarted: 3,
              converted: 1,
              conversionRate: 12.5,
              statusUpdates: 7,
              lastActivityAt: '2026-11-22T10:00:00.000Z',
              statuses: [{ statusId: '665f1c2a3b4d5e6f7a8b9c11', name: 'New', color: 'slate', order: 0, count: 3 }],
            }],
          }),
          400: messageResponse('`from` or `to` was not a parseable date.', 'Invalid date filter'),
          500: messageResponse('The report could not be built.', 'Server error building the performance report'),
        }),
      },
    ),
  },

  '/api/leads/reports/telecallers/{id}': {
    get: op(
      'leadsTelecallerTasks',
      'Leads assigned to one staff member',
      `${GATE}

**Permission:** branch owner or company admin only, same as GET /api/leads/reports/telecallers. Staff get **403** \`{ "error": "You do not have access to this area" }\`.

One person\'s assignment rows, including leads later given to someone else (\`state=previous\`). The rows are Meta assignment records. Google Ads leads are not here. Manual leads assigned with POST /api/leads/manual/assign are not here either, because that handler does not write an assignment row.

\`source\` accepts \`meta\`, \`website\`, \`upload\`, or \`form\`. \`upload\` and \`form\` look for a manual \`source\` of those exact strings. Current manual leads use \`manual\`, \`import\`, or \`referral\`, so those two filters match nothing. Use \`meta\` for Meta leads.

For a manual row that does exist, \`lead.fullName\` is read from a \`name\` path ManualLead does not store (the field is \`fullName\`), so the name comes back empty. \`lead.fields\` is \`{}\` for manual and website rows. Meta rows include \`fields\`, \`formName\`, and \`pageName\`. \`lead.source\` is \`META\`, \`MANUAL\`, or \`WEBSITE\`. \`lead.sourceLabel\` is \`Meta\` for Meta, otherwise the raw channel string (\`manual\`, \`import\`, \`referral\`, or \`website\`).

\`counts\` ignores search, status, source, and priority. \`total\` is the filtered count. \`from\` / \`to\` are validated (**400** when not dates) and then not applied.

A user id that is not 24 hex, or a user who is not staff and has no assignment rows, is **404** \`Counsellor not found\`.`,
      {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: oid, description: 'Staff user id from the report\'s `user._id`.' },
          { name: 'state', in: 'query', schema: { type: 'string', enum: ['all', 'active', 'previous'], default: 'all' }, description: '`active` = they hold it now. `previous` = it was handed on. Anything else is 400 `Invalid task filter`.' },
          ...paging('limit'),
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 }, description: 'Case-insensitive in practice because stored search text is lowercased. Matches that text only, not assignee or status names. Cut at 100 characters.' },
          statusIdQuery('A status id, or `none` for an empty current status. Anything else is 400 `Invalid status filter`.'),
          { name: 'source', in: 'query', schema: { type: 'string', enum: ['meta', 'website', 'upload', 'form'] }, description: 'See the description. `upload` and `form` match no current manual lead. Anything else is 400 `Invalid source filter`.' },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Same boolean filter as the lists. Any other non-empty value is 400 `Invalid priority filter`.' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Validated, then not applied.' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: 'Validated, then not applied.' },
        ],
        responses: withAuth({
          200: json('The staff member and one page of their assignment rows.', {
            type: 'object',
            required: ['counsellor', 'tasks', 'page', 'limit', 'total', 'totalPages', 'counts'],
            properties: {
              counsellor: {
                type: 'object',
                properties: {
                  _id: oid,
                  name: { type: 'string' },
                  email: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive'] },
                },
              },
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { allOf: [oid], description: 'Assignment row id, not the lead id.' },
                    isActive: { type: 'boolean' },
                    assignedAt: dateTime,
                    endedAt: nullableDate,
                    currentStatus: { type: 'object', nullable: true, additionalProperties: true },
                    history: { type: 'array', items: statusHistoryEntry },
                    lastActivityAt: nullableDate,
                    lead: {
                      type: 'object',
                      properties: {
                        _id: oid,
                        fullName: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                        fields: { type: 'object', additionalProperties: true },
                        formName: { type: 'string' },
                        pageName: { type: 'string' },
                        source: { type: 'string', enum: ['META', 'MANUAL', 'WEBSITE'] },
                        sourceLabel: { type: 'string' },
                        isPriority: { type: 'boolean' },
                        leadCreatedAt: nullableDate,
                        createdAt: dateTime,
                        crmLead: {
                          type: 'object',
                          nullable: true,
                          description: 'Legacy registration, present only when one is linked. Not the Innovbit client.',
                          properties: {
                            registrationBy: { type: 'string' },
                            formSubmitted: { type: 'boolean' },
                            registrationPath: { type: 'string', nullable: true, description: '`/register/<token>` until the form is submitted, then null.' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer', description: 'Filtered count.' },
              totalPages: { type: 'integer' },
              counts: {
                type: 'object',
                properties: {
                  all: { type: 'integer' },
                  active: { type: 'integer' },
                  previous: { type: 'integer' },
                },
                description: 'Unfiltered by search, status, source, and priority.',
              },
            },
          }, {
            counsellor: { _id: '665f1c2a3b4d5e6f7a8b9c22', name: 'Anita Shah', email: 'anita@example.com', status: 'active' },
            tasks: [],
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 1,
            counts: { all: 0, active: 0, previous: 0 },
          }),
          400: messageResponse('`Invalid task filter`, `Invalid source filter`, `Invalid priority filter`, `Invalid status filter`, or `Invalid date filter`.', 'Invalid task filter'),
          404: messageResponse('Not a staff member with assignment rows.', 'Counsellor not found'),
          500: messageResponse('The task list could not be loaded.', 'Server error retrieving counsellor tasks'),
        }),
      },
    ),
  },
};
