const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    kind: { type: String, enum: ['session', 'package'], required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
    clientPackage: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientPackage' },
    description: { type: String, required: true },

    // Money, in paise.
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    platformFee: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 }, // amount - platformFee

    status: { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: 'created', index: true },
    gatewayOrderId: { type: String, unique: true, sparse: true },
    gatewayPaymentId: { type: String }, // Razorpay payment id (gateway_transaction_id)
    method: { type: String },
    failureReason: { type: String },
    paidAt: Date,
    refundedAt: Date,

    // Frozen at payment time so editing billing settings later never rewrites an old invoice.
    invoice: {
      number: String,
      issuedAt: Date,
      businessName: String,
      address: String,
      gstin: String,
      gstRatePercent: Number,
      taxableAmount: Number,
      cgst: Number,
      sgst: Number,
      clientName: String,
      clientEmail: String,
    },
  },
  { timestamps: true }
);

// An invoice number is unique per therapist (only checked once a number exists).
paymentSchema.index(
  { therapist: 1, 'invoice.number': 1 },
  { unique: true, partialFilterExpression: { 'invoice.number': { $exists: true } } }
);

module.exports = mongoose.model('Payment', paymentSchema);
