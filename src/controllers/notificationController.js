const Notification = require('../models/Notification');

// GET /api/notifications — the logged-in therapist's notification feed (newest first).
exports.listMyNotifications = async (req, res, next) => {
  try {
    const items = await Notification.find({ therapist: req.therapist._id })
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 30)
      .lean();
    const unread = await Notification.countDocuments({ therapist: req.therapist._id, readAt: null });
    res.json({ notifications: items, unread });
  } catch (err) {
    next(err);
  }
};

// POST /api/notifications/:id/read
exports.markAsRead = async (req, res, next) => {
  try {
    const doc = await Notification.findOneAndUpdate(
      { _id: req.params.id, therapist: req.therapist._id },
      { $set: { readAt: new Date() } },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ message: 'Notification not found' });
    res.json({ notification: doc });
  } catch (err) {
    next(err);
  }
};

// POST /api/notifications/read-all
exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ therapist: req.therapist._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};