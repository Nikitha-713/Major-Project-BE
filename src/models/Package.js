const mongoose = require('mongoose');

// What a therapist offers for sale, e.g. "6 session pack".
const packageSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    sessions: { type: Number, required: true },
    price: { type: Number, required: true }, // paise, total for the whole pack
    durationMin: { type: Number, required: true },
    validityDays: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Package', packageSchema);
