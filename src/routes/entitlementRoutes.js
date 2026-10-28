const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getSummary } = require('../services/entitlementService');

router.get('/me', auth, async (req, res, next) => {
  try { res.json(await getSummary(req.user.id)); } catch (e) { next(e); }
});
module.exports = router;
