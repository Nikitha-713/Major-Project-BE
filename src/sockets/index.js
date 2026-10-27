const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Therapist = require('../models/Therapist');
const Client = require('../models/Client');
const registerChatHandlers = require('./chatSocket');

function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // Auth middleware. Accepts two kinds of tokens:
  //  - Therapist JWT (from authRoutes login) → req shape { id, role: 'therapist' }
  //  - Client portal token (a secret hex string, not a JWT) → resolved to { id, therapist, role: 'client' }
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const { token, portalToken } = auth;

      if (token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const therapist = await Therapist.findById(payload.id).select('_id name');
        if (!therapist) return next(new Error('therapist_not_found'));
        socket.user = { id: String(therapist._id), role: 'therapist' };
        return next();
      }

      if (portalToken) {
        const client = await Client.findOne({ portalToken: String(portalToken) }).select('_id therapist name');
        if (!client) return next(new Error('invalid_portal_token'));
        socket.user = { id: String(client._id), therapist: String(client.therapist), role: 'client' };
        return next();
      }

      return next(new Error('auth_required'));
    } catch (err) {
      return next(new Error('auth_failed'));
    }
  });

  io.on('connection', (socket) => {
    registerChatHandlers(io, socket);
  });

  return io;
}

module.exports = { initSockets:initSockets };