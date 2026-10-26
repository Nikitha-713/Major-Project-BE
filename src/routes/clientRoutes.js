const router = require('express').Router();
const { body, param } = require('express-validator');
const protect = require('../middleware/authMiddleware');
const { validate } = require('../middleware/errorHandler');
const c = require('../controllers/clientController');

router.use(protect); // every client route is therapist-only

const idParam = param('id').isMongoId().withMessage('Invalid client');

router.get('/', c.listClients);

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Enter the client name'),
    body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).isLength({ max: 20 }).withMessage('Phone number is too long'),
    body('tags').optional().isArray({ max: 15 }).withMessage('Add up to 15 tags'),
  ],
  validate,
  c.createClient
);

router.get('/:id', idParam, validate, c.getClient);

router.patch(
  '/:id',
  [
    idParam,
    body('name').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2 to 80 characters'),
    body('phone').optional({ checkFalsy: true }).isLength({ max: 20 }).withMessage('Phone number is too long'),
    body('status').optional().isIn(['active', 'inactive', 'archived']).withMessage('Invalid status'),
    body('tags').optional().isArray({ max: 15 }).withMessage('Add up to 15 tags'),
  ],
  validate,
  c.updateClient
);

module.exports = router;
