const mongoose = require('mongoose');

// Append-only audit trail. Every field is immutable and there is no update or delete route.
// The exact wording the client agreed to is stored as a snapshot.
const immutableString = (extra = {}) => ({ type: String, immutable: true, ...extra });

const consentRecordSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, immutable: true, index: true },
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, immutable: true, index: true },
    type: immutableString({ required: true, enum: ['treatment_consent'] }),
    version: immutableString({ required: true }),
    title: immutableString({ required: true }),
    textSnapshot: immutableString({ required: true }),
    acceptedAt: { type: Date, required: true, immutable: true },
    ipAddress: immutableString({ default: '' }),
    userAgent: immutableString({ default: '', maxlength: 300 }),
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('ConsentRecord', consentRecordSchema);
