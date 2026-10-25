const mongoose = require('mongoose');
const { DEFAULTS } = require('../config/schedulingDefaults');

// All times are "HH:mm" in the THERAPIST's timezone. They are converted to UTC only when
// slots are generated, so daylight-saving changes never corrupt stored data.
const windowSchema = new mongoose.Schema(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false }
);

// Recurring weekly template. A day that is missing here is closed.
const weeklyDaySchema = new mongoose.Schema(
  { dayOfWeek: { type: Number, min: 0, max: 6, required: true }, windows: { type: [windowSchema], default: [] } },
  { _id: false }
);

// One-time override for a date. Empty windows = closed all day; otherwise replaces the weekly hours.
const overrideSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    windows: { type: [windowSchema], default: [] },
    note: { type: String, default: '', maxlength: 100 },
  },
  { _id: false }
);

// A time range removed from an otherwise open day (lunch, appointment, etc).
const blockedSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    reason: { type: String, default: '', maxlength: 100 },
  },
  { _id: false }
);

const availabilitySchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, unique: true },
    timezone: { type: String, default: DEFAULTS.timezone },
    weeklyHours: { type: [weeklyDaySchema], default: [] },
    overrides: { type: [overrideSchema], default: [] },
    blockedSlots: { type: [blockedSchema], default: [] },
    bufferMin: { type: Number, default: DEFAULTS.bufferMin },
    sessionDurations: { type: [Number], default: () => [...DEFAULTS.sessionDurations] },
    slotStepMin: { type: Number, default: DEFAULTS.slotStepMin },
    minNoticeHours: { type: Number, default: DEFAULTS.minNoticeHours },
    maxAdvanceDays: { type: Number, default: DEFAULTS.maxAdvanceDays },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Availability', availabilitySchema);
