const jwt = require('jsonwebtoken');
const Message = require('../models/Message');

// One room per therapist<->client pair
const roomId = (therapistId, clientId) => `chat:${therapistId}:${clientId}`;

module.exports = function initChat(io) {
  // Authenticate every socket with the same JWT used by the REST API
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const p = jwt.verify(token, process.env.JWT_SECRET);
      const id = String(p.id || p._id || p.therapistId || p.userId || p.clientId || '');
      if (!id) throw new Error('bad payload');
      socket.user = { id, role: p.role || (p.clientId ? 'client' : 'therapist') };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;

    // Participants come from the token, never from the client
    const resolve = (otherId) =>
      role === 'therapist'
        ? { therapist: id, client: otherId }
        : { therapist: otherId, client: id };

    socket.on('chat:join', ({ otherId }) => {
      const { therapist, client } = resolve(otherId);
      socket.join(roomId(therapist, client));
    });

    socket.on('chat:send', async ({ otherId, text }, ack) => {
      try {
        if (!text || !text.trim()) return;
        const { therapist, client } = resolve(otherId);
        const msg = await Message.create({ therapist, client, senderRole: role, text });
        io.to(roomId(therapist, client)).emit('chat:message', msg);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('chat:typing', ({ otherId, isTyping }) => {
      const { therapist, client } = resolve(otherId);
      socket.to(roomId(therapist, client)).emit('chat:typing', { role, isTyping });
    });

    socket.on('chat:read', async ({ otherId }) => {
      const { therapist, client } = resolve(otherId);
      const otherRole = role === 'therapist' ? 'client' : 'therapist';
      await Message.updateMany(
        { therapist, client, senderRole: otherRole, readAt: null },
        { readAt: new Date() }
      );
      socket.to(roomId(therapist, client)).emit('chat:read', { by: role });
    });
  });
};
