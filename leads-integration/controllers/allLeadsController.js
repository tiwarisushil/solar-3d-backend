// Combined lead list across Meta, Google Ads and manual leads (same filters where they apply).
const mongoose = require('mongoose');
const MetaLead = require('../models/MetaLead');
const GoogleLead = require('../models/GoogleLead');
const ManualLead = require('../models/ManualLead');
const MetaLeadAssignment = require('../models/MetaLeadAssignment');
const MetaLeadStatus = require('../models/MetaLeadStatus');
const { leadCompanyFilter } = require('../utils/tenant');
const { withAssignedScope } = require('../utils/leadScope');
const { applyLeadSearch } = require('../utils/leadSearch');
const { readPriorityFilter, priorityCondition } = require('../utils/leadPriority');
const { scheduleCondition, scheduleFilterCondition } = require('../utils/leadSchedule');
const { heldByCondition } = require('../utils/leadAssignment');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObjectId = (value) => typeof value === 'string' && mongoose.isValidObjectId(value);

const SOURCE_LABEL = { meta: 'Meta', google: 'Google Ads', manual: 'Added', import: 'Imported' };

const toRow = (lead, leadSource, extra = {}) => ({
  _id: lead._id,
  leadSource,
  sourceLabel: SOURCE_LABEL[leadSource] || leadSource,
  fullName: lead.fullName || '',
  phone: lead.phone || '',
  address: lead.address || '',
  receivedAt: lead.leadCreatedAt || lead.createdAt,
  createdAt: lead.createdAt,
  assignedTo: lead.assignedTo?._id
    ? { _id: lead.assignedTo._id, name: lead.assignedTo.name || '' }
    : lead.assignedTo?.name
      ? { _id: lead.assignedTo, name: lead.assignedTo.name }
      : null,
  assignedAt: lead.assignedAt || null,
  isPriority: Boolean(lead.isPriority),
  scheduledAt: lead.scheduledAt || null,
  rescheduledCount: lead.rescheduledCount || 0,
  isRescheduled: Boolean(lead.isRescheduled),
  isReassigned: Boolean(lead.isReassigned),
  reassignedCount: lead.reassignedCount || 0,
  assignmentHistory: (lead.assignmentHistory || []).map((h) => ({ id: h.assignee ? String(h.assignee) : null, name: h.assigneeName || '', assignedAt: h.assignedAt, endedAt: h.endedAt || null })),
  heldBefore: Boolean(lead.heldBefore),
  previousSchedules: (lead.previousSchedules || []).map((p) => ({ scheduledAt: p.scheduledAt, statusName: p.statusName || '', replacedAt: p.replacedAt, byName: p.byName || '' })),
  currentStatus: lead.currentStatus || null,
  convertedClient: lead.convertedClient || null,
  convertedClientName: lead.convertedClientName || '',
  convertedAt: lead.convertedAt || null,
  ...extra,
});

/** Which sources to include from ?source= (meta | google | manual | import). */
function sourcesWanted(raw) {
  const v = text(raw).toLowerCase();
  if (v === 'meta') return { meta: true, google: false, manual: false };
  if (v === 'google') return { meta: false, google: true, manual: false };
  if (v === 'manual' || v === 'import') return { meta: false, google: false, manual: true, manualSource: v };
  if (v === 'manual_all') return { meta: false, google: false, manual: true, manualSource: null }; // added and imported together (the Manual leads board)
  return { meta: true, google: true, manual: true, manualSource: null };
}

async function applyMetaStatusFilter(filter, req, statusId, tenant) {
  if (!statusId) return;
  if (statusId === 'none') {
    // no status from the telecaller nor the admin — including leads never assigned (they show as "Not started" too)
    const ownerHasStatus = await MetaLeadAssignment.distinct('lead', { ...tenant, isActive: true, currentStatus: { $ne: null } });
    filter.adminStatus = null;
    filter._id = { $nin: ownerHasStatus };
    return;
  }
  if (!isObjectId(statusId)) return;
  const owned = await MetaLeadAssignment.distinct('lead', { ...tenant, isActive: true, currentStatus: statusId });
  const ownerHasStatus = await MetaLeadAssignment.distinct('lead', { ...tenant, isActive: true, currentStatus: { $ne: null } });
  const adminOnly = await MetaLead.distinct('_id', {
    ...tenant,
    adminStatus: statusId,
    _id: { $nin: ownerHasStatus },
  });
  filter._id = { $in: [...owned, ...adminOnly] };
}

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Date range for activity rows (`logs.at`), not when the lead was received. */
function activityAtRange(req) {
  const from = text(req.query.from || req.query.fromDate);
  const to = text(req.query.to || req.query.toDate);
  const range = {};
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
}

/** Match log lines by status change (message starts with the status name) or by activity date. */
async function activityLogMatch(req, statusId) {
  const match = {};
  const at = activityAtRange(req);
  if (at) match['logs.at'] = at;
  if (statusId === 'none') {
    match['logs.action'] = { $nin: ['lead_status', 'lead_rescheduled'] };
  } else if (isObjectId(statusId)) {
    const st = await MetaLeadStatus.findOne({ ...leadCompanyFilter(req.leadsCompanyId), _id: statusId }).select('name').lean();
    if (st?.name) {
      match['logs.action'] = { $in: ['lead_status', 'lead_rescheduled'] };
      match['logs.message'] = new RegExp(`^${escapeRegex(st.name)}( ·|$)`);
    }
  }
  return match;
}

/**
 * @param {{ activity?: boolean }} opts  Activity feed: skip lead received-date and current-status filters
 *   (those are applied on each log line instead).
 */
async function buildMetaFilter(req, statusId, opts = {}) {
  const activity = Boolean(opts.activity);
  const tenant = leadCompanyFilter(req.leadsCompanyId);
  const filter = { ...tenant, processingStatus: 'processed', isDeleted: false };
  const search = text(req.query.search).slice(0, 100).toLowerCase();
  await applyLeadSearch(filter, { companyId: req.leadsCompanyId, search, kind: 'meta' });
  const assignedTo = text(req.query.assignedTo);
  if (assignedTo === 'unassigned') filter.assignedTo = null; // never assigned, or assignment cleared (as the dashboard counts them)
  else if (assignedTo === 'reassigned') filter.isReassigned = true;
  else if (isObjectId(assignedTo)) Object.assign(filter, heldByCondition(assignedTo, { includePast: text(req.query.includePast) === '1' }));
  const { priority, invalid } = readPriorityFilter(req.query.priority);
  if (invalid) throw Object.assign(new Error('Invalid filter'), { status: 400 });
  if (priority !== null) filter.isPriority = priorityCondition(priority);
  Object.assign(filter, scheduleFilterCondition(req.query));
  const pageId = text(req.query.pageId);
  const formId = text(req.query.formId);
  if (pageId) filter.pageId = pageId;
  if (formId) filter.formId = formId;
  if (!activity) {
    const from = text(req.query.from || req.query.fromDate);
    const to = text(req.query.to || req.query.toDate);
    if (from && !Number.isNaN(Date.parse(from))) filter.leadCreatedAt = { ...(filter.leadCreatedAt || {}), $gte: new Date(from) };
    if (to && !Number.isNaN(Date.parse(to))) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.leadCreatedAt = { ...(filter.leadCreatedAt || {}), $lte: end };
    }
    if (statusId) await applyMetaStatusFilter(filter, req, statusId, tenant);
  }
  withAssignedScope(filter, req);
  return { filter, tenant };
}

async function buildGoogleFilter(req, statusId, opts = {}) {
  const activity = Boolean(opts.activity);
  const filter = { ...leadCompanyFilter(req.leadsCompanyId), isDeleted: false };
  const search = text(req.query.search).slice(0, 100).toLowerCase();
  await applyLeadSearch(filter, { companyId: req.leadsCompanyId, search, kind: 'google' });
  const assignedTo = text(req.query.assignedTo);
  if (assignedTo === 'unassigned') filter.assignedTo = null;
  else if (assignedTo === 'reassigned') filter.isReassigned = true;
  else if (isObjectId(assignedTo)) Object.assign(filter, heldByCondition(assignedTo, { includePast: text(req.query.includePast) === '1' }));
  if (!activity) {
    if (statusId === 'none') filter.status = null;
    else if (isObjectId(statusId)) filter.status = statusId;
  }
  const { priority, invalid } = readPriorityFilter(req.query.priority);
  if (invalid) throw Object.assign(new Error('Invalid filter'), { status: 400 });
  if (priority !== null) filter.isPriority = priorityCondition(priority);
  Object.assign(filter, scheduleFilterCondition(req.query));
  if (!activity) {
    const from = text(req.query.from || req.query.fromDate);
    const to = text(req.query.to || req.query.toDate);
    if (from && !Number.isNaN(Date.parse(from))) filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    if (to && !Number.isNaN(Date.parse(to))) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { ...(filter.createdAt || {}), $lte: end };
    }
  }
  withAssignedScope(filter, req);
  return filter;
}

async function buildManualFilter(req, statusId, manualSource, opts = {}) {
  const activity = Boolean(opts.activity);
  const filter = { ...leadCompanyFilter(req.leadsCompanyId), isDeleted: false };
  const search = text(req.query.search).slice(0, 100).toLowerCase();
  await applyLeadSearch(filter, { companyId: req.leadsCompanyId, search, kind: 'manual' });
  const assignedTo = text(req.query.assignedTo);
  if (assignedTo === 'unassigned') filter.assignedTo = null;
  else if (assignedTo === 'reassigned') filter.isReassigned = true;
  else if (isObjectId(assignedTo)) Object.assign(filter, heldByCondition(assignedTo, { includePast: text(req.query.includePast) === '1' }));
  if (!activity) {
    if (statusId === 'none') filter.status = null;
    else if (isObjectId(statusId)) filter.status = statusId;
  }
  if (manualSource === 'manual' || manualSource === 'import') filter.source = manualSource;
  const { priority, invalid } = readPriorityFilter(req.query.priority);
  if (invalid) throw Object.assign(new Error('Invalid filter'), { status: 400 });
  if (priority !== null) filter.isPriority = priorityCondition(priority);
  Object.assign(filter, scheduleFilterCondition(req.query));
  if (!activity) {
    const from = text(req.query.from || req.query.fromDate);
    const to = text(req.query.to || req.query.toDate);
    if (from && !Number.isNaN(Date.parse(from))) filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    if (to && !Number.isNaN(Date.parse(to))) filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
  }
  withAssignedScope(filter, req);
  return filter;
}

async function loadMetaChunk(req, limit, statusId) {
  const { filter, tenant } = await buildMetaFilter(req, statusId);

  const [total, leads] = await Promise.all([
    MetaLead.countDocuments(filter),
    MetaLead.find(filter)
      .sort({ leadCreatedAt: -1, _id: -1 })
      .limit(limit)
      .select('fullName phone fields leadCreatedAt createdAt assignedTo isPriority scheduledAt rescheduledCount isRescheduled isReassigned reassignedCount assignmentHistory convertedClient convertedClientName convertedAt adminStatus')
      .populate('assignedTo', 'name')
      .populate('adminStatus', 'name color')
      .lean(),
  ]);
  const assignments = await MetaLeadAssignment.find({ ...tenant, lead: { $in: leads.map((l) => l._id) }, isActive: true })
    .select('lead currentStatus')
    .populate('currentStatus', 'name color')
    .lean();
  const statusByLead = new Map(assignments.map((a) => [String(a.lead), a.currentStatus]));
  const items = leads.map((lead) => {
    const currentStatus = statusByLead.get(String(lead._id)) || lead.adminStatus || null;
    const st = currentStatus
      ? { _id: currentStatus._id, name: currentStatus.name, color: currentStatus.color }
      : null;
    return toRow({ ...lead, currentStatus: st }, 'meta');
  });
  return { total, items };
}

async function loadGoogleChunk(req, limit, statusId) {
  const filter = await buildGoogleFilter(req, statusId);

  const [total, leads] = await Promise.all([
    GoogleLead.countDocuments(filter),
    GoogleLead.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select('fullName phone fields createdAt assignedTo assignedAt isPriority scheduledAt rescheduledCount isRescheduled isReassigned reassignedCount assignmentHistory convertedClient convertedClientName convertedAt statusName statusColor status')
      .populate('assignedTo', 'name')
      .populate('status', 'name color')
      .lean(),
  ]);
  const items = leads.map((lead) => toRow({
    ...lead,
    currentStatus: lead.status
      ? { _id: lead.status._id, name: lead.statusName || lead.status.name, color: lead.statusColor || lead.status.color }
      : null,
  }, 'google'));
  return { total, items };
}

async function loadManualChunk(req, limit, statusId, manualSource) {
  const filter = await buildManualFilter(req, statusId, manualSource);

  const [total, leads] = await Promise.all([
    ManualLead.countDocuments(filter),
    ManualLead.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select('fullName phone address source referredByClientName referredByClientPhone createdAt assignedTo assignedAt isPriority scheduledAt rescheduledCount isRescheduled isReassigned reassignedCount assignmentHistory convertedClient convertedClientName convertedAt statusName statusColor status')
      .populate('assignedTo', 'name')
      .lean(),
  ]);
  const items = leads.map((lead) => toRow({
    ...lead,
    currentStatus: lead.status
      ? { _id: lead.status._id || lead.status, name: lead.statusName, color: lead.statusColor }
      : null,
  }, lead.source === 'import' ? 'import' : 'manual', { address: lead.address || '', ...(lead.source === 'referral' ? { sourceLabel: 'Referral', referredByClientName: lead.referredByClientName || '', referredByClientPhone: lead.referredByClientPhone || '' } : {}) })); // a client's referral: a manual lead, named as what it is
  return { total, items };
}

const ACTIVITY_TITLE = {
  lead_assigned: 'Assigned',
  lead_reassigned: 'Reassigned',
  lead_unassigned: 'Assignment removed',
  lead_status: 'Status changed',
  lead_rescheduled: 'Rescheduled',
  referral: 'Referred by a client',
};

/** One log line as a feed row: lead, who holds it, and a readable summary of what happened. */
function toActivityRow(lead, log, leadSource) {
  const action = log.action || '';
  const message = text(log.message);
  const title = ACTIVITY_TITLE[action] || action || 'Activity';
  const parts = message ? message.split(' · ').map((p) => p.trim()).filter(Boolean) : [];
  let summary = title;
  let remark = '';
  if (action === 'lead_status' || action === 'lead_rescheduled') {
    const statusName = parts[0] || '';
    const rest = parts.slice(1);
    // status log is "Status · optional date · optional remark"
    if (rest.length >= 2) remark = rest.slice(1).join(' · ');
    else if (rest.length === 1 && !/^\w{3}\s+\d/i.test(rest[0]) && !/^\d/.test(rest[0])) remark = rest[0];
    summary = statusName
      ? `${action === 'lead_rescheduled' ? 'Rescheduled' : 'Status changed'} → ${statusName}`
      : title;
  } else if (action === 'lead_assigned' && message) {
    summary = `Assigned to ${message}`;
  } else if (action === 'lead_reassigned' && message) {
    summary = `Reassigned ${message}`;
  } else if (action === 'lead_unassigned') {
    summary = message || 'Assignment removed';
  } else if (message) {
    summary = `${title}: ${message}`;
    remark = message;
  }
  const assignee = lead.assignedTo?._id
    ? { _id: lead.assignedTo._id, name: lead.assignedTo.name || '' }
    : lead.assignedTo?.name
      ? { _id: lead.assignedTo, name: lead.assignedTo.name }
      : null;
  const source = leadSource === 'manual' && lead.source === 'import' ? 'import' : leadSource === 'manual' && lead.source === 'referral' ? 'manual' : leadSource;
  return {
    id: `${source}-${lead._id}-${log.at ? new Date(log.at).getTime() : 0}-${action}`,
    at: log.at || null,
    action,
    title,
    summary,
    message,
    remark,
    byName: log.byName || '',
    lead: {
      _id: lead._id,
      fullName: lead.fullName || '',
      phone: lead.phone || '',
      leadSource: source,
      sourceLabel: lead.source === 'referral' ? 'Referral' : (SOURCE_LABEL[source] || source),
    },
    assignedTo: assignee,
  };
}

const activityPipeline = (filter, logMatch, limit) => {
  const afterUnwind = Object.keys(logMatch).length ? [{ $match: logMatch }] : [];
  return [
    { $match: { ...filter, 'logs.0': { $exists: true } } },
    { $unwind: '$logs' },
    ...afterUnwind,
    { $sort: { 'logs.at': -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: '_assignee', pipeline: [{ $project: { name: 1 } }] } },
    {
      $project: {
        fullName: 1,
        phone: 1,
        source: 1,
        logs: 1,
        assignedTo: { $arrayElemAt: ['$_assignee', 0] },
      },
    },
  ];
};

const activityCountPipeline = (filter, logMatch) => {
  const afterUnwind = Object.keys(logMatch).length ? [{ $match: logMatch }] : [];
  return [
    { $match: { ...filter, 'logs.0': { $exists: true } } },
    { $unwind: '$logs' },
    ...afterUnwind,
    { $count: 'n' },
  ];
};

async function loadMetaActivity(req, limit, statusId) {
  const [{ filter }, logMatch] = await Promise.all([
    buildMetaFilter(req, statusId, { activity: true }),
    activityLogMatch(req, statusId),
  ]);
  const [countRow, rows] = await Promise.all([
    MetaLead.aggregate(activityCountPipeline(filter, logMatch)),
    MetaLead.aggregate(activityPipeline(filter, logMatch, limit)),
  ]);
  return { total: countRow[0]?.n || 0, items: rows.map((r) => toActivityRow(r, r.logs, 'meta')) };
}

async function loadGoogleActivity(req, limit, statusId) {
  const [filter, logMatch] = await Promise.all([
    buildGoogleFilter(req, statusId, { activity: true }),
    activityLogMatch(req, statusId),
  ]);
  const [countRow, rows] = await Promise.all([
    GoogleLead.aggregate(activityCountPipeline(filter, logMatch)),
    GoogleLead.aggregate(activityPipeline(filter, logMatch, limit)),
  ]);
  return { total: countRow[0]?.n || 0, items: rows.map((r) => toActivityRow(r, r.logs, 'google')) };
}

async function loadManualActivity(req, limit, statusId, manualSource) {
  const [filter, logMatch] = await Promise.all([
    buildManualFilter(req, statusId, manualSource, { activity: true }),
    activityLogMatch(req, statusId),
  ]);
  const [countRow, rows] = await Promise.all([
    ManualLead.aggregate(activityCountPipeline(filter, logMatch)),
    ManualLead.aggregate(activityPipeline(filter, logMatch, limit)),
  ]);
  return { total: countRow[0]?.n || 0, items: rows.map((r) => toActivityRow(r, r.logs, 'manual')) };
}

// @route GET /api/leads/all
const listAllLeads = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const statusId = text(req.query.statusId);
    const wanted = sourcesWanted(req.query.source);
    const fetchCap = page * pageSize;

    const parts = await Promise.all([
      wanted.meta ? loadMetaChunk(req, fetchCap, statusId) : { total: 0, items: [] },
      wanted.google ? loadGoogleChunk(req, fetchCap, statusId) : { total: 0, items: [] },
      wanted.manual ? loadManualChunk(req, fetchCap, statusId, wanted.manualSource) : { total: 0, items: [] },
    ]);

    const total = parts.reduce((n, p) => n + p.total, 0);
    const merged = parts
      .flatMap((p) => p.items)
      .sort((a, b) => (scheduleCondition(req.query.schedule) ? new Date(a.scheduledAt) - new Date(b.scheduledAt) : 0) || new Date(b.receivedAt) - new Date(a.receivedAt) || String(b._id).localeCompare(String(a._id))); // a schedule filter: soonest first
    const leads = merged.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      leads,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('[ALL_LEADS]', error.message);
    res.status(500).json({ message: 'Could not load leads' });
  }
};

// The Kanban board: every lead (all sources, same filters as the list) in a column per status, "Not started" first.
// Each source is capped so the board stays usable; `truncated` tells the page when a source had more.
const BOARD_CAP = 400;
const listLeadBoard = async (req, res) => {
  try {
    const wanted = sourcesWanted(req.query.source);
    const [meta, google, manual, statuses] = await Promise.all([
      wanted.meta ? loadMetaChunk(req, BOARD_CAP, '') : { total: 0, items: [] },
      wanted.google ? loadGoogleChunk(req, BOARD_CAP, '') : { total: 0, items: [] },
      wanted.manual ? loadManualChunk(req, BOARD_CAP, '', wanted.manualSource) : { total: 0, items: [] },
      // deleted statuses too: leads may still sit in one, and must not vanish from the board
      MetaLeadStatus.find({ ...leadCompanyFilter(req.leadsCompanyId) }).sort({ order: 1, createdAt: 1 }).lean(),
    ]);
    const byStatus = new Map();
    for (const lead of [meta, google, manual].flatMap((p) => p.items)) {
      const key = lead.currentStatus ? String(lead.currentStatus._id) : 'none';
      if (!byStatus.has(key)) byStatus.set(key, []);
      byStatus.get(key).push(lead);
    }
    const newestFirst = (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt) || String(b._id).localeCompare(String(a._id));
    const column = (id, st, leads) => ({
      id,
      name: st.name,
      color: st.color || 'slate',
      outcome: st.outcome || 'open',
      requiresDate: Boolean(st.requiresDate),
      isActive: st.isActive !== false,
      count: leads.length,
      leads: leads.sort(newestFirst),
    });
    const columns = [
      column('none', { name: 'Not started', color: 'slate', outcome: 'open' }, byStatus.get('none') || []),
      // switched-off and deleted statuses stay only while a lead still sits in them (nothing can be dropped there)
      ...statuses
        .filter((st) => (st.isActive !== false && !st.isDeleted) || byStatus.has(String(st._id)))
        .map((st) => column(String(st._id), st.isDeleted ? { ...st, name: `${st.name} (deleted)`, isActive: false } : st, byStatus.get(String(st._id)) || [])),
    ];
    // a status id that no longer exists at all: keep those leads visible too
    const shown = new Set(columns.map((c) => c.id));
    const orphans = [...byStatus.keys()].filter((key) => !shown.has(key)).flatMap((key) => byStatus.get(key));
    if (orphans.length) columns.push(column('missing', { name: 'Status removed', color: 'slate', outcome: 'open', isActive: false }, orphans));
    const parts = [meta, google, manual];
    res.json({
      columns,
      total: parts.reduce((n, p) => n + p.total, 0),
      truncated: parts.some((p) => p.total > BOARD_CAP),
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Error loading the lead board:', error);
    res.status(500).json({ message: 'Could not load the board' });
  }
};

// @route GET /api/leads/activity — every log line on matching leads (same filters as the list), newest first
const listLeadActivity = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const statusId = text(req.query.statusId);
    const wanted = sourcesWanted(req.query.source);
    const fetchCap = page * pageSize;

    const parts = await Promise.all([
      wanted.meta ? loadMetaActivity(req, fetchCap, statusId) : { total: 0, items: [] },
      wanted.google ? loadGoogleActivity(req, fetchCap, statusId) : { total: 0, items: [] },
      wanted.manual ? loadManualActivity(req, fetchCap, statusId, wanted.manualSource) : { total: 0, items: [] },
    ]);

    const total = parts.reduce((n, p) => n + p.total, 0);
    const activities = parts
      .flatMap((p) => p.items)
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0) || String(b.id).localeCompare(String(a.id)))
      .slice((page - 1) * pageSize, page * pageSize);

    res.json({
      activities,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('[LEAD_ACTIVITY]', error.message);
    res.status(500).json({ message: 'Could not load activity' });
  }
};

module.exports = { listAllLeads, listLeadBoard, listLeadActivity };
