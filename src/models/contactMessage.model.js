import mongoose from 'mongoose';
import { schemaOptions, text } from './schemaOptions.js';

// A message from the public landing page's Contact Us form. Belongs to no company; the platform admin
// reads these in the Admin console as leads to call back.
export const CONTACT_MESSAGE_STATUS = ['new', 'contacted', 'closed'];

const contactMessageSchema = new mongoose.Schema(
  {
    name: { ...text(120), required: true },
    email: { ...text(160, { lowercase: true }), required: true },
    phone: { ...text(20), required: true },
    company: text(160),
    message: { ...text(4000), required: true },
    status: { type: String, enum: CONTACT_MESSAGE_STATUS, default: 'new', index: true },
    adminNotes: text(2000),
    ip: text(60),
    userAgent: text(400),
    referrer: text(300),
  },
  schemaOptions,
);
contactMessageSchema.index({ createdAt: -1 });

export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
