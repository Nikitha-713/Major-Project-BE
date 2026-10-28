const jwt = require('jsonwebtoken');
const Therapist = require('../models/Therapist');

/**
 * Verifies the JWT and sets:
 *   req.user        -> { id, role }   (used by chat, entitlements, analytics, clients)
 *   req.userId / req.therapistId      (aliases, in case older code uses them)
 *   req.therapist   -> therapist document without password (for therapist tokens)
 *
 * Works whatever field name your login used when signing the token
 * (id, _id, therapistId, userId, clientId).
 */
module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Not authorized, invalid or expired token' });
    }

    const id = String(
      decoded.id || decoded._id || decoded.therapistId || decoded.userId || decoded.clientId || ''
    );
    if (!id) return res.status(401).json({ message: 'Not authorized, bad token payload' });

    const role = decoded.role || (decoded.clientId ? 'client' : 'therapist');

    req.user = { id, role };
    req.userId = id;
    if (role === 'therapist') req.therapistId = id;

    // Load the therapist document for older code that expects req.therapist
    if (role === 'therapist') {
      const therapist = await Therapist.findById(id).select('-password -password_hash');
      if (!therapist) return res.status(401).json({ message: 'Not authorized, user not found' });
      req.therapist = therapist;
    }

    next();
  } catch (err) {
    next(err);
  }
};
