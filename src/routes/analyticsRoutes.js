const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getAnalytics } = require('../controllers/analyticsController');
router.get('/', auth, getAnalytics);
module.exports = router;
