const mongoose = require('mongoose');

// A package a client has bought. Terms are copied at purchase time, so later edits to the
// offer never change what the client already paid for.
const clientPackageSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    name: { type: String, required: true },
    sessionsTotal: { type: Number, required: true },
    sessionsRemaining: { type: Number, required: true },
    durationMin: { type: Number, required: true },
    validityDays: { type: Number, required: true },
    pricePaid: { type: Number, required: true }, // paise
    perSessionRate: { type: Number, required: true }, // paise, pricePaid / sessionsTotal
    purchasedAt: Date,
    expiresAt: Date, // credits are worthless after this moment
    status: {
      type: String,
      enum: ['pending_payment', 'active', 'exhausted', 'expired'],
      default: 'pending_payment',
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClientPackage', clientPackageSchema);
