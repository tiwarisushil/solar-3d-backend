// Contact Us messages from the public landing page: a visitor fills the form (no sign-in), and the
// platform admin reads them in the Admin console as leads.
import { ContactMessage } from '../models/index.js';
import { CONTACT_MESSAGE_STATUS } from '../models/contactMessage.model.js';
import { badRequest, notFound } from '../utils/HttpError.js';
import { toApiJSON, toApiJSONList } from '../utils/lean.js';
import { objectId } from '../utils/validators.js';

const clip = (v, max) => String(v ?? '').trim().slice(0, max);

/** Trim and check the fields the visitor typed. */
function cleanContact(body = {}) {
  const name = clip(body.name, 120);
  const email = clip(body.email, 160).toLowerCase();
  const phone = clip(body.phone, 20);
  const company = clip(body.company, 160);
  const message = clip(body.message, 4000);
  if (name.length < 2) throw badRequest('Enter your name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address');
  if (phone.replace(/\D/g, '').length < 7) throw badRequest('Enter your mobile number');
  if (message.length < 5) throw badRequest('Enter a short message');
  return { name, email, phone, company, message };
}

/** Save a new contact message from the public site. `meta` = { ip, userAgent, referrer }. */
export async function createContactMessage(body = {}, meta = {}) {
  const clean = cleanContact(body);
  const doc = await ContactMessage.create({
    ...clean,
    ip: clip(meta.ip, 60),
    userAgent: clip(meta.userAgent, 400),
    referrer: clip(meta.referrer, 300),
  });
  return toApiJSON(doc.toObject());
}

export async function listContactMessages() {
  return toApiJSONList(await ContactMessage.find({}).sort({ createdAt: -1 }).limit(1000).lean());
}

export async function getContactMessage(id) {
  const row = await ContactMessage.findById(objectId(id, 'Contact message')).lean();
  if (!row) throw notFound('Contact message');
  return toApiJSON(row);
}

export const countNewContactMessages = () => ContactMessage.countDocuments({ status: 'new' });

export async function updateContactMessage(id, body = {}) {
  const set = {};
  if (body.status !== undefined) {
    if (!CONTACT_MESSAGE_STATUS.includes(body.status)) throw badRequest('Unknown status');
    set.status = body.status;
  }
  if (body.adminNotes !== undefined) set.adminNotes = clip(body.adminNotes, 2000);
  const row = await ContactMessage.findByIdAndUpdate(objectId(id, 'Contact message'), { $set: set }, { returnDocument: 'after' }).lean();
  if (!row) throw notFound('Contact message');
  return toApiJSON(row);
}

export async function removeContactMessage(id) {
  const row = await ContactMessage.findByIdAndDelete(objectId(id, 'Contact message'));
  if (!row) throw notFound('Contact message');
  return { ok: true };
}
