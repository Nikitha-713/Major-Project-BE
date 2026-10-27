const Message = require('../models/Message');
const Client = require('../models/Client');

// Room name: one thread per (therapistId, clientId) pair
const roomFor = (therapistId, clientId) => `thread:${therapistId}:${clientId}`;

async function authorizeThread(socket, therapistId, clientId) {
  if (socket.user.role === 'therapist') {
    return String(socket.user.id) === String(therapistId);
  }
  if (socket.user.role === 'client') {
    return (
      String(socket.user.id) === String(clientId) &&
      String(socket.user.therapist) === String(therapistId)
    );
  }
  return false;
}

module.exports = function registerChatHandlers(io, socket) {
  socket.on('chat:join', async (payload, ack) => {
    try {
      const { therapistId, clientId } = payload || {};
      if (!therapistId || !clientId) return ack?.({ ok: false, error: 'missing_ids' });
      const allowed = await authorizeThread(socket, therapistId, clientId);
      if (!allowed) return ack?.({ ok: false, error: 'forbidden' });

      socket.join(roomFor(therapistId, clientId));
      return ack?.({ ok: true });
    } catch (err) {
      return ack?.({ ok: false, error: 'server_error' });
    }
  });

  socket.on('chat:send', async (payload, ack) => {
    try {
      const { therapistId, clientId, body } = payload || {};
      if (!therapistId || !clientId || !body || !body.trim()) {
        return ack?.({ ok: false, error: 'invalid_message' });
      }
      const allowed = await authorizeThread(socket, therapistId, clientId);
      if (!allowed) return ack?.({ ok: false, error: 'forbidden' });

      const msg = await Message.create({
        therapist: therapistId,
        client: clientId,
        senderRole: socket.user.role,
        senderId: socket.user.id,
        body: body.trim().slice(0, 4000),
      });

      const json = msg.toObject();
      io.to(roomFor(therapistId, clientId)).emit('chat:message', json);
      return ack?.({ ok: true, message: json });
    } catch (err) {
      console.error('[chat:send]', err.message);
      return ack?.({ ok: false, error: 'server_error' });
    }
  });

  socket.on('chat:typing', (payload) => {
    const { therapistId, clientId, isTyping } = payload || {};
    if (!therapistId || !clientId) return;
    socket.to(roomFor(therapistId, clientId)).emit('chat:typing', {
      therapistId,
      clientId,
      fromRole: socket.user.role,
      isTyping: Boolean(isTyping),
    });
  });

  socket.on('chat:read', async (payload, ack) => {
    try {
      const { therapistId, clientId } = payload || {};
      if (!therapistId || !clientId) return ack?.({ ok: false });
      const allowed = await authorizeThread(socket, therapistId, clientId);
      if (!allowed) return ack?.({ ok: false, error: 'forbidden' });

      const otherRole = socket.user.role === 'therapist' ? 'client' : 'therapist';
      await Message.updateMany(
        { therapist: therapistId, client: clientId, senderRole: otherRole, readAt: null },
        { $set: { readAt: new Date() } }
      );
      io.to(roomFor(therapistId, clientId)).emit('chat:read', {
        therapistId,
        clientId,
        byRole: socket.user.role,
        at: new Date().toISOString(),
      });
      return ack?.({ ok: true });
    } catch (err) {
      return ack?.({ ok: false, error: 'server_error' });
    }
  });
};