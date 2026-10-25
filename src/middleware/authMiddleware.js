const jwt = require('jsonwebtoken');
const Therapist = require('../models/Therapist');

// Verifies the Bearer token and attaches the therapist to req.therapist.
module.exports = async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const therapist = await Therapist.findById(payload.id);
    if (!therapist) return res.status(401).json({ message: 'Account no longer exists' });

    req.therapist = therapist;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
