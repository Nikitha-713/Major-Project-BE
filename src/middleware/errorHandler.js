const { validationResult } = require('express-validator');

// Error handler: Express recognises it by the 4 parameters
const errorHandler = (err, req, res, next) => {
  console.error('ERROR:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }
  if (err.code === 11000) {
    return res.status(409).json({
      message: `${Object.keys(err.keyValue || {})[0] || 'Value'} already exists`,
    });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID' });
  }

  res.status(err.status || 500).json({ message: err.message || 'Server error' });
};

// express-validator result checker, used in authRoutes
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }
  next();
};

module.exports = errorHandler;                 // works with: const errorHandler = require(...)
module.exports.errorHandler = errorHandler;    // works with: const { errorHandler } = require(...)
module.exports.validate = validate;            // works with: const { validate } = require(...)