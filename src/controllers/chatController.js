const Message = require('../models/Message');
const Client = require('../models/Client');

// GET /api/chat/:clientId/messages — therapist fetching history with one of their clients.
exports.getMessagesForTherapist = async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const client = await Client.findOne({ _id: clientId, therapist: req.therapist._id }).select('_id');
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const before = req.query.before ? new Date(req.query.before) : new Date();
    const messages = await Message.find({
      therapist: req.therapist._id,
      client: client._id,
      createdAt: { $lt: before },
    })
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 50)
      .lean();

    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
};

// POST /api/chat/:clientId/messages — REST fallback for sending if sockets are down.
exports.postMessageAsTherapist = async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ message: 'Message body is required' });

    const client = await Client.findOne({ _id: clientId, therapist: req.therapist._id }).select('_id');
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const msg = await Message.create({
      therapist: req.therapist._id,
      client: client._id,
      senderRole: 'therapist',
      senderId: req.therapist._id,
      body: body.trim().slice(0, 4000),
    });

    // If sockets are attached to app.locals, broadcast so live clients see it.
    const io = req.app.get('io');
    if (io) io.to(`thread:${req.therapist._id}:${client._id}`).emit('chat:message', msg.toObject());

    res.status(201).json({ message: msg });
  } catch (err) {
    next(err);
  }
};

// Client portal route. Uses the portal token (already validated by portalRoutes' middleware).
exports.getMessagesForClient = async (req, res, next) => {
  try {
    // Assumes portalRoutes set req.client = the client doc from the token.
    const client = req.client;
    const messages = await Message.find({
      therapist: client.therapist,
      client: client._id,
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    res.json({ messages });
  } catch (err) {
    next(err);
  }
};

// Client portal — POST a message.
exports.postMessageAsClient = async (req, res, next) => {
  try {
    const client = req.client;
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ message: 'Message body is required' });

    const msg = await Message.create({
      therapist: client.therapist,
      client: client._id,
      senderRole: 'client',
      senderId: client._id,
      body: body.trim().slice(0, 4000),
    });

    const io = req.app.get('io');
    if (io) io.to(`thread:${client.therapist}:${client._id}`).emit('chat:message', msg.toObject());

    res.status(201).json({ message: msg });
  } catch (err) {
    next(err);
  }
};