// Pure money helpers. ALL amounts are integers in paise (1 rupee = 100 paise) so there is
// never a floating-point rounding error in a payment.
const { PLATFORM_FEE_PERCENT } = require('../config/billing');

const toMinor = (rupees) => Math.round(Number(rupees) * 100);

const computeFee = (amountMinor, percent = PLATFORM_FEE_PERCENT) => Math.round((amountMinor * percent) / 100);

// Prices are what the client pays (GST included). Split a GST-inclusive total into
// taxable value and CGST + SGST halves. With no rate the whole amount is the taxable value.
function splitTax(totalMinor, ratePercent) {
  if (!ratePercent || ratePercent <= 0) return { taxable: totalMinor, cgst: 0, sgst: 0 };
  const taxable = Math.round(totalMinor / (1 + ratePercent / 100));
  const tax = totalMinor - taxable;
  const cgst = Math.floor(tax / 2);
  return { taxable, cgst, sgst: tax - cgst };
}

// "INR 1,800.00" (the PDF's built-in font has no rupee symbol).
const formatInr = (minor) =>
  `INR ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = { toMinor, computeFee, splitTax, formatInr };
