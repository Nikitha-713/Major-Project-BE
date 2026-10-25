// Stub. Module 6 turns this into the real event-driven NotificationService
// (email via Nodemailer, WhatsApp via a queue). Callers already use the final interface.
const queue = [];

function notify(event, payload) {
  queue.push({ event, payload, at: new Date() });
  console.log(`[notification:stub] ${event}`, JSON.stringify(payload));
}

module.exports = { notify, queue };
