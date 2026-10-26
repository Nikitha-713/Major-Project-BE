const mongoose = require('mongoose');
const crypto = require('crypto');

const clientSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    timezone: { type: String, default: 'UTC' },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    tags: { type: [String], default: [] },

    // Secret link token for the client portal (/portal/:token). Never returned by default;
    // only the owning therapist's profile endpoint selects it explicitly.
    portalToken: {
      type: String,
      default: () => crypto.randomBytes(32).toString('hex'),
      unique: true,
      select: false,
    },

    // Filled in once by the client through the portal.
    intake: {
      completedAt: Date,
      demographics: {
        dateOfBirth: Date,
        gender: { type: String, trim: true, maxlength: 40 },
        occupation: { type: String, trim: true, maxlength: 80 },
        city: { type: String, trim: true, maxlength: 80 },
      },
      presentingConcern: { type: String, trim: true, maxlength: 2000 },
      history: {
        previousTherapy: Boolean,
        previousTherapyDetails: { type: String, trim: true, maxlength: 1000 },
        medications: { type: String, trim: true, maxlength: 500 },
        medicalConditions: { type: String, trim: true, maxlength: 500 },
      },
      emergencyContact: {
        name: { type: String, trim: true, maxlength: 80 },
        phone: { type: String, trim: true, maxlength: 20 },
        relationship: { type: String, trim: true, maxlength: 40 },
      },
    },
  },
  { timestamps: true }
);

// One client record per email per therapist.
clientSchema.index({ therapist: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Client', clientSchema);
