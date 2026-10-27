const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    // Linked after the booking is confirmed (see schedulingController). Older sessions may not have one.
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    // The booking also keeps a copy of the contact details as entered at the time.
    serviceId: { type: mongoose.Schema.Types.ObjectId },
    serviceTitle: { type: String, default: 'Therapy session' },
    durationMin: { type: Number, required: true },
    startTime: { type: Date, required: true }, // UTC
    endTime: { type: Date, required: true },
    occupiedUntil: { type: Date, required: true }, // endTime + buffer
    // 5-minute cells covered by [startTime, occupiedUntil). Used only for the overlap guard below.
    cells: { type: [Number], required: true, select: false },

    // pending_payment = time is held while the client pays; expired = hold ran out unpaid.
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show', 'expired'],
      default: 'confirmed',
    },
    // true while this session occupies its time (pending or confirmed). Removed on cancel/expiry.
    holdsSlot: { type: Boolean },
    holdExpiresAt: { type: Date },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'package', 'refunded'],
      default: 'not_required',
    },
    clientPackage: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientPackage' },

    clientName: { type: String, required: true, trim: true, maxlength: 80 },
    clientEmail: { type: String, required: true, lowercase: true, trim: true },
    clientPhone: { type: String, trim: true, maxlength: 20, default: '' },
    clientTimezone: { type: String, default: 'UTC' },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// DOUBLE-BOOKING GUARD. A unique multikey index means two sessions that hold a slot can never
// share a 5-minute cell of the same therapist. If two clients click the same slot at the same
// instant, MongoDB lets exactly one insert succeed and rejects the other (error code 11000).
// Cancelled or expired sessions drop `holdsSlot`, so the partial filter excludes them and their
// time becomes bookable again. (A held-but-unpaid session blocks the slot exactly like a paid one.)
sessionSchema.index(
  { therapist: 1, cells: 1 },
  { unique: true, partialFilterExpression: { holdsSlot: true } }
);
sessionSchema.index({ therapist: 1, startTime: 1 });

module.exports = mongoose.model('Session', sessionSchema);
