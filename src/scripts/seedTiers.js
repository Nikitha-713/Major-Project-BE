// Run: node src/scripts/seedTiers.js
require('dotenv').config();
const mongoose = require('mongoose');
const TierConfig = require('../models/SubscriptionTierConfig');

const tiers = [
  { tier: 'free',    displayName: 'Free',    rank: 1, priceMonthly: 0,
    caps: { activeClients: 5 },  features: { soapDapTemplates: false, analyticsDepth: 'basic',    analyticsMonths: 3 } },
  { tier: 'pro',     displayName: 'Pro',     rank: 2, priceMonthly: 999,
    caps: { activeClients: 30 }, features: { soapDapTemplates: true,  analyticsDepth: 'basic',    analyticsMonths: 6 } },
  { tier: 'premium', displayName: 'Premium', rank: 3, priceMonthly: 1999,
    caps: { activeClients: -1 }, features: { soapDapTemplates: true,  analyticsDepth: 'advanced', analyticsMonths: 12 } },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  for (const t of tiers) await TierConfig.updateOne({ tier: t.tier }, t, { upsert: true });
  console.log('Tiers seeded');
  process.exit(0);
})();
