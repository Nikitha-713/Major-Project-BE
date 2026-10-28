const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getHistory } = require('../controllers/chatController');

router.get('/:otherId', auth, getHistory);
module.exports = router;
