const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    // Module 3 will add a `client` reference; until then the booking carries contact details.
    serviceId: { type: mongoose.Schema.Types.ObjectId },
    serviceTitle: { type: String, default: 'Therapy session' },
    durationMin: { type: Number, required: true },
    startTime: { type: Date, required: true }, // UTC
    endTime: { type: Date, required: true },
    occupiedUntil: { type: Date, required: true }, // endTime + buffer
    // 5-minute cells covered by [startTime, occupiedUntil). Used only for the overlap guard below.
    cells: { type: [Number], required: true, select: false },
    status: { type: String, enum: ['confirmed', 'cancelled', 'completed', 'no_show'], default: 'confirmed' },
    clientName: { type: String, required: true, trim: true, maxlength: 80 },
    clientEmail: { type: String, required: true, lowercase: true, trim: true },
    clientPhone: { type: String, trim: true, maxlength: 20, default: '' },
    clientTimezone: { type: String, default: 'UTC' },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// DOUBLE-BOOKING GUARD. A unique multikey index means two confirmed sessions of the same
// therapist can never share a 5-minute cell. If two clients click the same slot at the same
// instant, MongoDB lets exactly one insert succeed and rejects the other (error code 11000).
// Cancelled sessions are excluded by the partial filter, so their time becomes bookable again.
sessionSchema.index(
  { therapist: 1, cells: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);
sessionSchema.index({ therapist: 1, startTime: 1 });

module.exports = mongoose.model('Session', sessionSchema);
