// All money-related settings come from configuration, never from constants buried in routes.
const num = (v, fallback) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback);

module.exports = {
  CURRENCY: 'INR',
  PLATFORM_FEE_PERCENT: num(process.env.PLATFORM_FEE_PERCENT, 5),
  HOLD_MINUTES: num(process.env.SLOT_HOLD_MINUTES, 15),
  INVOICE_PREFIX: process.env.INVOICE_PREFIX || 'INV',
  PACKAGE_SESSION_OPTIONS: [3, 6, 12],
  PACKAGE_DURATION_OPTIONS: [30, 45, 60, 90],
  PACKAGE_VALIDITY_DAYS: { min: 7, max: 365 },
  MIN_PRICE_MINOR: 100, // Rs 1, in paise
  MAX_PRICE_MINOR: 10000000, // Rs 1,00,000
  GST_RATE_MAX: 28,
};
