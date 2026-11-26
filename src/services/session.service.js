import crypto from 'node:crypto';
import { ROLES } from '../constants/index.js';
import { AuthSession, Company, User } from '../models/index.js';
import { HttpError } from '../utils/HttpError.js';
import { sessionExpiresAt } from '../utils/token.js';
import { sessionLimitOf } from './plan.service.js';
import { inTransaction } from './stock.service.js';

export const DEVICE_LIMIT_CODE = 'DEVICE_LIMIT';

export function newSessionId() {
  return crypto.randomUUID();
}

function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  if (/iPhone|iPad/i.test(ua)) return 'iPhone or iPad';
  if (/Android/i.test(ua)) return 'Android device';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux device';
  return ua.slice(0, 60) || 'Unknown device';
}

/**
 * The plan's device limit covers the company's own (owner) sign-ins. Field agents have their own accounts and
 * are exempt: they neither use up nor get blocked by the owner's devices.
 */
async function ownerSessionFilter(companyId) {
  const owners = await User.find({ company: companyId, role: ROLES.BRANCH }).distinct('_id');
  return { company: companyId, user: { $in: owners } };
}

async function purgeExpiredForCompany(companyId) {
  const now = new Date();
  await AuthSession.deleteMany({
    company: companyId,
    $or: [{ expiresAt: { $lte: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }],
  });
}

export async function listActiveCompanySessions(companyId) {
  await purgeExpiredForCompany(companyId);
  const rows = await AuthSession.find({ ...(await ownerSessionFilter(companyId)), expiresAt: { $gt: new Date() } })
    .sort({ lastActiveAt: -1 })
    .populate('user', 'name email role')
    .limit(20);
  return rows.map((s) => ({
    sessionId: s.sessionId,
    userName: s.user?.name || s.user?.email || 'User',
    userEmail: s.user?.email || '',
    role: s.user?.role || '',
    device: deviceLabel(s.userAgent),
    lastActiveAt: s.lastActiveAt,
  }));
}

/** `company` is null for platform-admin sessions and for an admin's impersonation of a company (2 hours). */
export async function registerSession({ user, company = null, sessionId, userAgent, impersonation = false }) {
  await AuthSession.create({
    user: user._id,
    company: company?._id || null,
    sessionId,
    userAgent: userAgent?.slice(0, 300) || '',
    lastActiveAt: new Date(),
    expiresAt: sessionExpiresAt({ impersonation }),
  });
}

/** Sign one user out everywhere (used when their password changes or is reset). */
export async function revokeUserSessions(userId) {
  await AuthSession.deleteMany({ user: userId });
}

/** Returns false if the session id is unknown or expired. */
export async function validateSession(sessionId) {
  if (!sessionId) return false;
  const row = await AuthSession.findOneAndUpdate(
    { sessionId, expiresAt: { $gt: new Date() } },
    { $set: { lastActiveAt: new Date() } },
  );
  return Boolean(row);
}

export async function revokeSession(sessionId) {
  if (!sessionId) return;
  await AuthSession.deleteOne({ sessionId });
}

/** Sign out every device for this company (used after password check on the sign-in page). */
export async function revokeAllCompanySessions(companyId) {
  await AuthSession.deleteMany(await ownerSessionFilter(companyId));
}

/** One person's own active sessions (the company admin's devices), for the device-limit dialog. */
async function listUserSessions(userId) {
  const rows = await AuthSession.find({ user: userId, expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 }).populate('user', 'name email role').limit(20);
  return rows.map((s) => ({ sessionId: s.sessionId, userName: s.user?.name || s.user?.email || 'User', userEmail: s.user?.email || '', role: s.user?.role || '', device: deviceLabel(s.userAgent), lastActiveAt: s.lastActiveAt }));
}

const deviceLimitMessage = (max) => (max === 1
  ? 'Another device is already signed in. Sign out there first, then try again.'
  : `The limit of ${max} devices signed in at once has been reached. Sign out on one of them, then try again.`);

/** Thrown inside the transaction (so it aborts); `sessions` is filled in once the transaction has ended. */
class DeviceLimitReached extends Error {
  constructor(max, active) {
    super('device limit');
    this.max = max;
    this.active = active;
  }
}

/**
 * Open a branch owner's or company admin's session within the company's sign-in limit
 * (`sessionLimitOf(company, organization)`). The same limit applies, unsplit, to each scope:
 * - `branch`: the active sessions of that branch's owners (field agents are not counted);
 * - `admin`: the company admin's own active sessions. The admin signs in to the whole organization, so branch owner
 *   sessions never count against them, and theirs never count against a branch.
 *
 * Check and insert run in one transaction that first bumps `sessionVersion` on the scope's document (the branch, or
 * the admin user). Two sign-ins for the same scope therefore write the same document: one gets a write conflict and
 * is retried after the other commits, so it counts the committed session. A refused sign-in never leaves a session.
 */
export async function openLimitedSession({ user, company, organization = null, sessionId, userAgent, scope }) {
  if (scope !== 'branch' && scope !== 'admin') throw new Error(`Unknown session scope: ${scope}`);
  const max = sessionLimitOf(company, organization);
  let filter;
  if (scope === 'branch') {
    await purgeExpiredForCompany(company._id);
    filter = await ownerSessionFilter(company._id);
  } else {
    filter = { user: user._id };
  }
  try {
    await inTransaction(async (session) => {
      if (scope === 'branch') await Company.updateOne({ _id: company._id }, { $inc: { sessionVersion: 1 } }, { session });
      else await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } }, { session });
      const now = new Date();
      const active = await AuthSession.countDocuments({ ...filter, expiresAt: { $gt: now } }).session(session);
      if (active >= max) throw new DeviceLimitReached(max, active);
      await AuthSession.create([{
        user: user._id,
        company: company?._id || null,
        sessionId,
        userAgent: userAgent?.slice(0, 300) || '',
        lastActiveAt: now,
        expiresAt: sessionExpiresAt(),
      }], { session });
    });
  } catch (err) {
    if (!(err instanceof DeviceLimitReached)) throw err;
    const sessions = scope === 'branch' ? await listActiveCompanySessions(company._id) : await listUserSessions(user._id);
    throw new HttpError(403, deviceLimitMessage(err.max), DEVICE_LIMIT_CODE, { max: err.max, active: err.active, sessions });
  }
}
