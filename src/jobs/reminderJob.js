const Session = require('../models/Session');
const { notify, EVENTS } = require('../services/notificationService');

/**
 * Requires two Boolean fields on Session (default false):
 *   reminderSent, followupSent
 * Runs every 10 minutes using setInterval (no extra dependency).
 */
async function tick() {
  const now = new Date();
  const h = 3600 * 1000;

  // 24h reminders: sessions starting in the next 24h window
  const upcoming = await Session.find({
    status: 'confirmed',
    reminderSent: { $ne: true },
    startTime: { $gt: now, $lte: new Date(now.getTime() + 24 * h) },
  }).populate('client');

  for (const s of upcoming) {
    notify.emit(EVENTS.SESSION_REMINDER, {
      email: s.client?.email, phone: s.client?.phone,
      clientName: s.client?.name, when: s.startTime.toISOString(),
    });
    s.reminderSent = true;
    await s.save();
  }

  // Follow-up: sessions that ended in the last 24h
  const done = await Session.find({
    status: 'completed',
    followupSent: { $ne: true },
    endTime: { $lte: now, $gte: new Date(now.getTime() - 24 * h) },
  }).populate('client');

  for (const s of done) {
    notify.emit(EVENTS.SESSION_FOLLOWUP, {
      email: s.client?.email, phone: s.client?.phone, clientName: s.client?.name,
    });
    s.followupSent = true;
    await s.save();
  }
}

module.exports = function startReminderJob() {
  setInterval(() => tick().catch((e) => console.error('[reminderJob]', e.message)), 10 * 60 * 1000);
  tick().catch(() => {});
};
