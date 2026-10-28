const { canAccess } = require('../services/entitlementService');

// Usage: router.post('/', auth, requireFeature('active_clients'), createClient)
module.exports = (featureKey) => async (req, res, next) => {
  try {
    const result = await canAccess(req.user.id, featureKey);
    if (!result.allowed) {
      return res.status(403).json({
        code: 'UPGRADE_REQUIRED',
        featureKey,
        message: result.reason,
        limit: result.limit,
        current: result.current,
        requiredTier: result.requiredTier,
      });
    }
    req.entitlement = result;   // controllers can read e.g. req.entitlement.value
    next();
  } catch (e) { next(e); }
};
