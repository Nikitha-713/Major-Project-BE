const router = require('express').Router();
const { body, param } = require('express-validator');
const protect = require('../middleware/authMiddleware');
const { validate } = require('../middleware/errorHandler');
const c = require('../controllers/schedulingController');

// Therapist (private)
router.get('/availability', protect, c.getMyAvailability);
router.put('/availability', protect, c.updateMyAvailability);
router.get('/sessions', protect, c.listMySessions);
router.patch('/sessions/:id/cancel', protect, param('id').isMongoId().withMessage('Invalid session'), validate, c.cancelSession);

// Public (clients)
router.get('/public/:slug/slots', c.getPublicSlots);
router.post(
  '/public/:slug/book',
  [
    body('startTime').isISO8601().withMessage('Choose a start time'),
    body('clientName').trim().isLength({ min: 2, max: 80 }).withMessage('Enter your name'),
    body('clientEmail').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    body('clientPhone').optional({ checkFalsy: true }).isLength({ max: 20 }).withMessage('Phone number is too long'),
    body('clientTimezone').optional().isLength({ max: 60 }),
    body('serviceId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid session type'),
    body('durationMin').optional({ nullable: true }).isInt().withMessage('Invalid session length'),
  ],
  validate,
  c.bookSlot
);

module.exports = router;
