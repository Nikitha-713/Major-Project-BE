const router = require('express').Router();
const { body, param } = require('express-validator');
const protect = require('../middleware/authMiddleware');
const { validate } = require('../middleware/errorHandler');
const c = require('../controllers/paymentController');
const cfg = require('../config/billing');

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const idParam = param('id').isMongoId().withMessage('Invalid id');

/* Therapist (private) */
router.get('/billing', protect, c.getBilling);
router.put(
  '/billing',
  protect,
  [
    body('collectAdvancePayment').optional().isBoolean().withMessage('Invalid payment setting'),
    body('businessName').optional().isLength({ max: 100 }).withMessage('Business name is too long'),
    body('address').optional().isLength({ max: 300 }).withMessage('Address is too long'),
    body('gstin')
      .optional({ checkFalsy: true })
      .customSanitizer((v) => String(v).trim().toUpperCase())
      .matches(GSTIN).withMessage('That GSTIN does not look right (15 characters, like 29ABCDE1234F1Z5)'),
    body('gstRatePercent').optional().isFloat({ min: 0, max: cfg.GST_RATE_MAX }).withMessage(`GST rate must be between 0 and ${cfg.GST_RATE_MAX}`),
  ],
  validate,
  c.updateBilling
);

router.get('/packages', protect, c.listPackages);
router.post(
  '/packages',
  protect,
  [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Give the package a name'),
    body('sessions').isIn(cfg.PACKAGE_SESSION_OPTIONS).withMessage(`Choose ${cfg.PACKAGE_SESSION_OPTIONS.join(', ')} sessions`),
    body('price').isInt({ min: cfg.MIN_PRICE_MINOR, max: cfg.MAX_PRICE_MINOR }).withMessage('Enter a valid price'),
    body('durationMin').isIn(cfg.PACKAGE_DURATION_OPTIONS).withMessage('Choose a session length'),
    body('validityDays').isInt(cfg.PACKAGE_VALIDITY_DAYS).withMessage(`Validity must be ${cfg.PACKAGE_VALIDITY_DAYS.min} to ${cfg.PACKAGE_VALIDITY_DAYS.max} days`),
  ],
  validate,
  c.createPackage
);
router.patch(
  '/packages/:id',
  protect,
  [idParam, body('active').optional().isBoolean(), body('name').optional().trim().isLength({ min: 2, max: 80 })],
  validate,
  c.updatePackage
);

router.get('/', protect, c.listPayments);
router.get('/:id/invoice', protect, idParam, validate, c.downloadInvoice);

/* Public */
router.post(
  '/verify',
  [
    body('razorpay_order_id').isString().notEmpty(),
    body('razorpay_payment_id').isString().notEmpty(),
    body('razorpay_signature').isString().notEmpty(),
  ],
  validate,
  c.verifyPayment
);
router.post('/portal/:token/package-order', [body('packageId').isMongoId().withMessage('Choose a package')], validate, c.createPackageOrder);
router.get('/portal/:token/invoices/:id', idParam, validate, c.downloadPortalInvoice);

module.exports = router;
