const express = require('express');
const protect = require('../middleware/authMiddleware');
const ctrl = require('../controllers/notificationController');

const router = express.Router();

router.get('/', protect, ctrl.listMyNotifications);
router.post('/:id/read', protect, ctrl.markAsRead);
router.post('/read-all', protect, ctrl.markAllAsRead);

module.exports = router;