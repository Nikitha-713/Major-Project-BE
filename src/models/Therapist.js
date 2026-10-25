const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 400, default: '' },
    durationMin: { type: Number, enum: [30, 45, 60, 90], default: 60 },
    // Price is therapist-entered data (not a platform constant). Optional: "contact for pricing".
    price: { type: Number, min: 0 },
  },
  { _id: true }
);

const therapistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    slug: { type: String, required: true, unique: true, lowercase: true },
    headline: { type: String, trim: true, maxlength: 140, default: '' },
    bio: { type: String, trim: true, maxlength: 2000, default: '' },
    specializations: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    services: { type: [serviceSchema], default: [] },
    // Used by the Entitlement Service in Module 7. Stored as a key, never compared in routes.
    subscriptionTier: { type: String, default: 'free' },
  },
  { timestamps: true }
);

// The ONLY shape of a therapist that may leave the API on public routes.
// Whitelisting (instead of deleting sensitive fields) means new private fields are safe by default.
therapistSchema.methods.toPublicProfile = function () {
  return {
    name: this.name,
    slug: this.slug,
    headline: this.headline,
    bio: this.bio,
    specializations: this.specializations,
    languages: this.languages,
    services: this.services.map((s) => ({
      id: s._id,
      title: s.title,
      description: s.description,
      durationMin: s.durationMin,
      price: s.price,
    })),
  };
};

// Shape returned to the logged-in therapist themselves.
therapistSchema.methods.toOwnerJSON = function () {
  return {
    id: this._id,
    email: this.email,
    subscriptionTier: this.subscriptionTier,
    ...this.toPublicProfile(),
  };
};

module.exports = mongoose.model('Therapist', therapistSchema);
