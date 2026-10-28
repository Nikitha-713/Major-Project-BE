const Message = require('../models/Message');

// GET /api/chat/:otherId  -> message history
exports.getHistory = async (req, res, next) => {
  try {
    const { id, role } = req.user;
    const filter = role === 'therapist'
      ? { therapist: id, client: req.params.otherId }
      : { therapist: req.params.otherId, client: id };
    const messages = await Message.find(filter).sort({ createdAt: 1 }).limit(200);
    res.json(messages);
  } catch (e) { next(e); }
};
