const { DateTime, IANAZone } = require('luxon');
const { OPTIONS, LIMITS } = require('../config/schedulingDefaults');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function checkWindows(windows, label) {
  if (!Array.isArray(windows)) return `${label}: hours are invalid`;
  if (windows.length > LIMITS.maxWindowsPerDay) return `${label}: use at most ${LIMITS.maxWindowsPerDay} time ranges`;
  const sorted = [...windows].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  for (let i = 0; i < sorted.length; i += 1) {
    const w = sorted[i];
    if (!TIME.test(w.start) || !TIME.test(w.end)) return `${label}: enter times as HH:MM`;
    if (w.start >= w.end) return `${label}: end time must be after start time`;
    if (i > 0 && w.start < sorted[i - 1].end) return `${label}: time ranges overlap`;
  }
  return null;
}

const validDate = (d) => DATE.test(d) && DateTime.fromISO(d).isValid;
const pickWindows = (ws) => ws.map((w) => ({ start: w.start, end: w.end }));

// Returns { error } or { value } containing only known, cleaned fields.
function validateAvailability(body) {
  const value = {};

  if (body.timezone !== undefined) {
    if (!IANAZone.isValidZone(body.timezone)) return { error: 'Choose a valid timezone' };
    value.timezone = body.timezone;
  }

  if (body.bufferMin !== undefined) {
    if (!OPTIONS.bufferMin.includes(Number(body.bufferMin))) return { error: 'Choose a valid buffer time' };
    value.bufferMin = Number(body.bufferMin);
  }

  if (body.slotStepMin !== undefined) {
    if (!OPTIONS.slotStepMin.includes(Number(body.slotStepMin))) return { error: 'Choose a valid slot interval' };
    value.slotStepMin = Number(body.slotStepMin);
  }

  if (body.sessionDurations !== undefined) {
    const list = [...new Set((body.sessionDurations || []).map(Number))];
    if (list.length === 0 || !list.every((d) => OPTIONS.sessionDurations.includes(d))) {
      return { error: 'Choose at least one session length' };
    }
    value.sessionDurations = list.sort((a, b) => a - b);
  }

  if (body.minNoticeHours !== undefined) {
    const n = Number(body.minNoticeHours);
    if (!Number.isInteger(n) || n < 0 || n > LIMITS.maxMinNoticeHours) return { error: 'Minimum notice is out of range' };
    value.minNoticeHours = n;
  }

  if (body.maxAdvanceDays !== undefined) {
    const n = Number(body.maxAdvanceDays);
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxAdvanceDays) return { error: 'Booking window is out of range' };
    value.maxAdvanceDays = n;
  }

  if (body.weeklyHours !== undefined) {
    if (!Array.isArray(body.weeklyHours)) return { error: 'Weekly hours are invalid' };
    const seen = new Set();
    value.weeklyHours = [];
    for (const day of body.weeklyHours) {
      const dow = Number(day.dayOfWeek);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6 || seen.has(dow)) return { error: 'Weekly hours are invalid' };
      seen.add(dow);
      const err = checkWindows(day.windows, DAY_NAMES[dow]);
      if (err) return { error: err };
      if (day.windows.length) value.weeklyHours.push({ dayOfWeek: dow, windows: pickWindows(day.windows) });
    }
  }

  if (body.overrides !== undefined) {
    if (!Array.isArray(body.overrides) || body.overrides.length > LIMITS.maxOverrides) return { error: 'Too many special days' };
    const dates = new Set();
    value.overrides = [];
    for (const o of body.overrides) {
      if (!validDate(o.date) || dates.has(o.date)) return { error: 'Each special day needs its own valid date' };
      dates.add(o.date);
      const err = checkWindows(o.windows || [], `Special day ${o.date}`);
      if (err) return { error: err };
      value.overrides.push({ date: o.date, windows: pickWindows(o.windows || []), note: String(o.note || '').slice(0, 100) });
    }
  }

  if (body.blockedSlots !== undefined) {
    if (!Array.isArray(body.blockedSlots) || body.blockedSlots.length > LIMITS.maxBlockedSlots) return { error: 'Too many blocked times' };
    value.blockedSlots = [];
    for (const b of body.blockedSlots) {
      if (!validDate(b.date) || !TIME.test(b.start) || !TIME.test(b.end) || b.start >= b.end) {
        return { error: 'Each blocked time needs a date and an end time after its start' };
      }
      value.blockedSlots.push({ date: b.date, start: b.start, end: b.end, reason: String(b.reason || '').slice(0, 100) });
    }
  }

  return { value };
}

module.exports = { validateAvailability };
