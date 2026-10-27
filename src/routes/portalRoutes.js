const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const c = require('../controllers/portalController');
const notes = require('../controllers/noteController');
//const chatCtrl = require('../controllers/chatController');
// No login: access is by the secret token in the URL.
router.get('/:token', c.getPortal);

// Shared session notes only (never private ones): see noteController.listSharedForPortal.
router.get('/:token/notes', notes.listSharedForPortal);
//router.get('/:token/chat/messages', resolvePortalClient /*your existing middleware*/, chatCtrl.getMessagesForClient);
router.post(
  '/:token/intake',
  [
    body('demographics.dateOfBirth')
      .isISO8601().withMessage('Enter your date of birth')
      .bail()
      .custom((v) => {
        const d = new Date(v);
        return d <= new Date() && d.getUTCFullYear() >= 1900;
      }).withMessage('Enter a valid date of birth'),
    body('demographics.gender').optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage('Gender is too long'),
    body('demographics.occupation').optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage('Occupation is too long'),
    body('demographics.city').optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage('City is too long'),
    body('presentingConcern').trim().isLength({ min: 10, max: 2000 }).withMessage('Tell us a little about what brings you here (at least 10 characters)'),
    body('history.previousTherapy').isBoolean().withMessage('Say whether you have had therapy before'),
    body('history.previousTherapyDetails').optional({ checkFalsy: true }).isLength({ max: 1000 }).withMessage('Previous therapy details are too long'),
    body('history.medications').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Medications text is too long'),
    body('history.medicalConditions').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Medical conditions text is too long'),
    body('emergencyContact.name').trim().isLength({ min: 2, max: 80 }).withMessage('Enter an emergency contact name'),
    body('emergencyContact.phone').trim().isLength({ min: 5, max: 20 }).withMessage('Enter an emergency contact phone number'),
    body('emergencyContact.relationship').optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage('Relationship is too long'),
    body('consent.accepted').custom((v) => v === true).withMessage('You need to agree to the consent to continue'),
    body('consent.version').isString().withMessage('Consent version is missing'),
  ],
  validate,
  c.submitIntake
);
//router.post('/:token/chat/messages', resolvePortalClient, chatCtrl.postMessageAsClient);
module.exports = router;
