const router = require('express').Router();
const { body, param, query } = require('express-validator');
const protect = require('../middleware/authMiddleware');
const { validate } = require('../middleware/errorHandler');
const { FORMAT_KEYS } = require('../config/noteTemplates');
const c = require('../controllers/noteController');

router.use(protect); // every route in this file is therapist-only; the client-facing one is in portalRoutes

const idParam = param('id').isMongoId().withMessage('Invalid note');
const sectionsRule = body('sections').isArray({ min: 1, max: 6 }).withMessage('Add the note content');
const typeRule = (required) =>
  (required ? body('type').exists() : body('type').optional()).isIn(['private', 'shared']).withMessage('Choose private or shared');

router.get('/templates', c.getTemplates);

router.get(
  '/',
  [
    query('client').optional().isMongoId().withMessage('Invalid client'),
    query('session').optional().isMongoId().withMessage('Invalid session'),
    query('type').optional().isIn(['private', 'shared']).withMessage('Invalid note type'),
  ],
  validate,
  c.listNotes
);

router.post(
  '/',
  [
    body('client').isMongoId().withMessage('Choose a client'),
    body('session').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid session'),
    typeRule(false),
    body('format').optional().isIn(FORMAT_KEYS).withMessage('Unknown note format'),
    body('title').optional().trim().isLength({ max: 120 }).withMessage('Title can be up to 120 characters'),
    sectionsRule,
  ],
  validate,
  c.createNote
);

router.get('/:id', idParam, validate, c.getNote);

router.patch(
  '/:id',
  [
    idParam,
    body('session').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid session'),
    typeRule(false),
    body('title').optional().trim().isLength({ max: 120 }).withMessage('Title can be up to 120 characters'),
    body('sections').optional().isArray({ min: 1, max: 6 }).withMessage('Add the note content'),
  ],
  validate,
  c.updateNote
);

router.delete('/:id', idParam, validate, c.deleteNote);

module.exports = router;
