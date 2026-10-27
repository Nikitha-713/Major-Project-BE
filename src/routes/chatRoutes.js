const express = require('express');
const protect = require('../middleware/authMiddleware');
const ctrl = require('../controllers/chatController');

const router = express.Router();

router.get('/:clientId/messages', protect, ctrl.getMessagesForTherapist);
router.post('/:clientId/messages', protect, ctrl.postMessageAsTherapist);

module.exports = router;