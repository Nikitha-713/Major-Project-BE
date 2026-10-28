const mongoose = require('mongoose');

// Every cap, flag and price lives here (DB), never in code.
const tierSchema = new mongoose.Schema({
  tier:        { type: String, required: true, unique: true },   // 'free' | 'pro' | 'premium'
  displayName: { type: String, required: true },
  rank:        { type: Number, required: true },                 // ordering, used to find "required tier"
  priceMonthly:{ type: Number, default: 0 },                     // config, not hardcoded
  currency:    { type: String, default: 'INR' },
  caps: {
    activeClients: { type: Number, default: 5 },                 // -1 = unlimited
  },
  features: {
    soapDapTemplates: { type: Boolean, default: false },
    analyticsDepth:   { type: String, enum: ['basic', 'advanced'], default: 'basic' },
    analyticsMonths:  { type: Number, default: 3 },
  },
}, { timestamps: true });

module.exports = mongoose.model('SubscriptionTierConfig', tierSchema);
