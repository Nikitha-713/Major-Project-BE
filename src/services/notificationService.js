const EventEmitter = require('events');
const nodemailer = require('nodemailer');

/**
 * Event-driven notifications. Domain code only calls notify.emit(EVENT, payload);
 * channels (email / WhatsApp stub) are subscribers, so they can be swapped freely.
 */
const notify = new EventEmitter();

const EVENTS = {
  BOOKING_CONFIRMED: 'booking.confirmed',
  PAYMENT_SUCCESS: 'payment.success',
  SESSION_REMINDER: 'session.reminder',   // 24h before
  SESSION_FOLLOWUP: 'session.followup',   // after session
};

const templates = {
  [EVENTS.BOOKING_CONFIRMED]: (p) => ({ subject: 'Booking confirmed', text: `Hi ${p.clientName}, your session on ${p.when} is confirmed.` }),
  [EVENTS.PAYMENT_SUCCESS]:   (p) => ({ subject: 'Payment received', text: `We received your payment of ₹${p.amount}. Invoice is available in your portal.` }),
  [EVENTS.SESSION_REMINDER]:  (p) => ({ subject: 'Session reminder', text: `Reminder: you have a session on ${p.when}.` }),
  [EVENTS.SESSION_FOLLOWUP]:  (p) => ({ subject: 'How was your session?', text: `Hi ${p.clientName}, thanks for attending. Check your portal for shared notes.` }),
};

// ---- Channel: WhatsApp (STUB: log only; swap body for real API later) ----
const whatsappQueue = [];
async function sendWhatsApp(to, message) {
  whatsappQueue.push({ to, message, queuedAt: new Date() });
  console.log(`[WhatsApp STUB] -> ${to}: ${message}`);
}

// ---- Channel: Email (real if SMTP configured, else log) ----
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendEmail(to, { subject, text }) {
  if (!transporter) return console.log(`[Email STUB] -> ${to} | ${subject} | ${text}`);
  await transporter.sendMail({ from: process.env.MAIL_FROM || 'no-reply@unfazed.app', to, subject, text });
}

// ---- Wire every event to every channel ----
Object.values(EVENTS).forEach((event) => {
  notify.on(event, async (payload) => {
    try {
      const msg = templates[event](payload);
      if (payload.email) await sendEmail(payload.email, msg);
      if (payload.phone) await sendWhatsApp(payload.phone, msg.text);
    } catch (e) {
      // A failed notification must never break the booking/payment flow
      console.error(`[Notification] ${event} failed:`, e.message);
    }
  });
});

module.exports = { notify, EVENTS, whatsappQueue };
