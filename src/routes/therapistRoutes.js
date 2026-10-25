const router = require('express').Router();
const { body } = require('express-validator');
const protect = require('../middleware/authMiddleware');
const { validate } = require('../middleware/errorHandler');
const { updateMe, getPublicProfile, getShareHtml } = require('../controllers/therapistController');

router.put(
  '/me',
  protect,
  [
    body('name').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2 to 80 characters'),
    body('slug').optional().trim().isLength({ min: 3, max: 40 }).withMessage('Link must be 3 to 40 characters'),
    body('headline').optional().isLength({ max: 140 }).withMessage('Headline can be at most 140 characters'),
    body('bio').optional().isLength({ max: 2000 }).withMessage('Bio can be at most 2000 characters'),
    body('specializations').optional().isArray({ max: 15 }).withMessage('Add up to 15 specializations'),
    body('languages').optional().isArray({ max: 15 }).withMessage('Add up to 15 languages'),
    body('services').optional().isArray({ max: 8 }).withMessage('Add up to 8 services'),
    body('services.*.title').optional().trim().notEmpty().withMessage('Each service needs a title'),
    body('services.*.durationMin').optional().isIn([30, 45, 60, 90]).withMessage('Duration must be 30, 45, 60 or 90 minutes'),
    body('services.*.price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Price cannot be negative'),
  ],
  validate,
  updateMe
);

// Public routes (no auth). Keep these AFTER '/me' so "me" is never treated as a slug.
router.get('/public/:slug', getPublicProfile);
router.get('/public/:slug/share', getShareHtml);

module.exports = router;
