// All scheduling knobs live here (and in the Availability document), never inside routes.
module.exports = {
  DEFAULTS: {
    timezone: 'Asia/Kolkata',
    bufferMin: 10,
    sessionDurations: [60],
    slotStepMin: 30,
    minNoticeHours: 4,
    maxAdvanceDays: 60,
  },
  OPTIONS: {
    bufferMin: [0, 5, 10, 15, 30],
    sessionDurations: [30, 45, 60, 90],
    slotStepMin: [15, 30, 60],
  },
  LIMITS: {
    maxWindowsPerDay: 3,
    maxOverrides: 60,
    maxBlockedSlots: 60,
    maxMinNoticeHours: 168,
    maxAdvanceDays: 180,
  },
  // Booked time is stored as 5-minute "cells" so the database itself can reject overlaps.
  GRID_MIN: 5,
};
