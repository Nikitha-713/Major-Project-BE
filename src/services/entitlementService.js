const Therapist = require('../models/Therapist');
const Client = require('../models/Client');
const TierConfig = require('../models/SubscriptionTierConfig');

/**
 * THE single source of truth for feature access.
 * No route/controller/component may compare tier strings directly.
 *
 * featureKey -> { path: where it lives in the tier config, usage?: async counter }
 * To gate a new feature: add one line here + one line in the seed. Nothing else.
 */
const FEATURES = {
  active_clients:    { path: 'caps.activeClients',          usage: (tid) => Client.countDocuments({ therapist: tid, status: 'active' }) },
  soap_dap_templates:{ path: 'features.soapDapTemplates' },
  analytics_depth:   { path: 'features.analyticsDepth' },
  analytics_months:  { path: 'features.analyticsMonths' },
};

const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

async function getTierConfig(therapistId) {
  const therapist = await Therapist.findById(therapistId).select('tier').lean();
  if (!therapist) throw Object.assign(new Error('Therapist not found'), { status: 404 });
  const cfg = await TierConfig.findOne({ tier: therapist.tier || 'free' }).lean();
  if (!cfg) throw new Error(`Tier config missing for "${therapist.tier}"`);
  return cfg;
}

// Lowest tier that would grant the feature (for the upgrade prompt)
async function findRequiredTier(path, usageNeeded) {
  const tiers = await TierConfig.find().sort({ rank: 1 }).lean();
  const hit = tiers.find((t) => {
    const v = get(t, path);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === -1 || v > (usageNeeded ?? 0);
    return v === 'advanced';
  });
  return hit ? { tier: hit.tier, displayName: hit.displayName, priceMonthly: hit.priceMonthly, currency: hit.currency } : null;
}

/**
 * canAccess(therapistId, featureKey) ->
 *   { allowed, value, limit, current, requiredTier, reason }
 */
async function canAccess(therapistId, featureKey) {
  const def = FEATURES[featureKey];
  if (!def) throw new Error(`Unknown feature key: ${featureKey}`);

  const cfg = await getTierConfig(therapistId);
  const value = get(cfg, def.path);

  // Boolean flag
  if (typeof value === 'boolean') {
    return value
      ? { allowed: true, value }
      : { allowed: false, value, reason: 'Not included in your plan', requiredTier: await findRequiredTier(def.path) };
  }

  // Numeric cap (with usage counter) -> -1 means unlimited
  if (typeof value === 'number' && def.usage) {
    if (value === -1) return { allowed: true, value, limit: -1 };
    const current = await def.usage(therapistId);
    return current < value
      ? { allowed: true, value, limit: value, current }
      : { allowed: false, value, limit: value, current, reason: `Plan limit of ${value} reached`, requiredTier: await findRequiredTier(def.path, current) };
  }

  // Plain config value (e.g. analytics depth/months): always "allowed", caller reads .value
  return { allowed: true, value };
}

// Everything the frontend needs to render gating (UI hint only; server still enforces)
async function getSummary(therapistId) {
  const cfg = await getTierConfig(therapistId);
  const usage = {};
  for (const [key, def] of Object.entries(FEATURES)) if (def.usage) usage[key] = await def.usage(therapistId);
  return { tier: cfg.tier, displayName: cfg.displayName, caps: cfg.caps, features: cfg.features, usage };
}

module.exports = { canAccess, getSummary, getTierConfig };
