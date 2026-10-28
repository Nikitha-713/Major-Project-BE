# Module 7 wiring

## 1. Therapist model: add
```js
tier: { type: String, default: 'free' },
```

## 2. app.js
```js
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/entitlements', require('./routes/entitlementRoutes'));
```
errorHandler should pass through `err.status`.

## 3. Seed tiers
node src/scripts/seedTiers.js

## 4. Gate 3 features (all via the entitlement service)

### a) Active-client cap  (clientRoutes.js)
```js
const requireFeature = require('../middleware/entitlementMiddleware');
router.post('/', auth, requireFeature('active_clients'), clientController.createClient);
```

### b) Note template type  (noteRoutes.js / noteController.js)
```js
// in createNote, only when the body asks for a structured template:
const { canAccess } = require('../services/entitlementService');
if (['SOAP', 'DAP'].includes(req.body.template)) {
  const r = await canAccess(req.user.id, 'soap_dap_templates');
  if (!r.allowed) return res.status(403).json({ code: 'UPGRADE_REQUIRED', featureKey: 'soap_dap_templates', message: r.reason, requiredTier: r.requiredTier });
}
```

### c) Analytics depth - already done inside analyticsController.

## 5. Quick test
- Create 5 active clients on a free therapist, then POST a 6th -> 403 UPGRADE_REQUIRED.
- Change therapist.tier to 'premium' in Mongo -> same call succeeds, no code changes.
- Change a cap in the tier collection -> behaviour changes with no deploy (the config-driven proof).
