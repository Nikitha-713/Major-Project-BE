const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Therapist = require('../models/Therapist');
const { generateUniqueSlug } = require('../utils/generateSlug');

const signToken = (therapist) =>
  jwt.sign({ id: therapist._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (await Therapist.exists({ email: email.toLowerCase() })) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slug = await generateUniqueSlug(Therapist, name);
    const therapist = await Therapist.create({ name, email, passwordHash, slug });

    res.status(201).json({ token: signToken(therapist), therapist: therapist.toOwnerJSON() });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const therapist = await Therapist.findOne({ email: email.toLowerCase() }).select('+passwordHash');

    // Same message for unknown email and wrong password, so emails can't be probed.
    const ok = therapist && (await bcrypt.compare(password, therapist.passwordHash));
    if (!ok) return res.status(401).json({ message: 'Incorrect email or password' });

    res.json({ token: signToken(therapist), therapist: therapist.toOwnerJSON() });
  } catch (err) {
    next(err);
  }
};

exports.me = (req, res) => {
  res.json({ therapist: req.therapist.toOwnerJSON() });
};
