const mongoose = require('mongoose');

const tierConfigSchema = new mongoose.Schema({
  tier: { type: String, required: true, unique: true }, // 'free', 'pro', 'premium'
  name: { type: String, required: true }, // 'Free Plan', 'Pro Plan'
  priceMonthly: { type: Number, default: 0 }, // In INR, 0 for free
  
  // THE CAPS
  activeClientCap: { type: Number, default: 5 },
  analyticsDepthDays: { type: Number, default: 7 },
  
  // THE FEATURES
  features: {
    chat: { type: Boolean, default: false },
    customNoteTemplates: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
  }
}, { timestamps: true });

module.exports = mongoose.model('TierConfig', tierConfigSchema);