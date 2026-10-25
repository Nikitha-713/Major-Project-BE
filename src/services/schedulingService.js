// Pure functions (no database calls) so the slot logic is easy to test.
const { DateTime } = require('luxon');
const { GRID_MIN } = require('../config/schedulingDefaults');

function windowsForDate(av, dateKey, luxonWeekday) {
  const override = av.overrides.find((o) => o.date === dateKey);
  if (override) return override.windows;
  const dayOfWeek = luxonWeekday % 7; // luxon: Mon=1..Sun=7  ->  0=Sun..6=Sat
  const day = av.weeklyHours.find((d) => d.dayOfWeek === dayOfWeek);
  return day ? day.windows : [];
}

/**
 * Returns an array of open slot start times as UTC ISO strings.
 * availability: lean Availability doc; bookedSessions: [{startTime, occupiedUntil}] (confirmed only)
 */
function generateOpenSlots({ availability: av, durationMin, bookedSessions, now = DateTime.utc() }) {
  const zone = av.timezone;
  const earliest = now.plus({ hours: av.minNoticeHours });
  const latest = now.plus({ days: av.maxAdvanceDays });
  const durationMs = durationMin * 60000;
  const occupiedMs = durationMs + av.bufferMin * 60000;
  const slots = [];

  let day = now.setZone(zone).startOf('day');
  const lastDay = latest.setZone(zone).startOf('day');

  while (day <= lastDay) {
    const dateKey = day.toISODate();

    const blocked = av.blockedSlots
      .filter((b) => b.date === dateKey)
      .map((b) => ({
        start: DateTime.fromISO(`${dateKey}T${b.start}`, { zone }).toMillis(),
        end: DateTime.fromISO(`${dateKey}T${b.end}`, { zone }).toMillis(),
      }));

    for (const w of windowsForDate(av, dateKey, day.weekday)) {
      const winStart = DateTime.fromISO(`${dateKey}T${w.start}`, { zone });
      const winEnd = DateTime.fromISO(`${dateKey}T${w.end}`, { zone });

      for (
        let t = winStart;
        t.plus({ minutes: durationMin }) <= winEnd;
        t = t.plus({ minutes: av.slotStepMin })
      ) {
        if (t < earliest || t > latest) continue;

        const s = t.toMillis();
        const e = s + durationMs;
        const clashesBooking = bookedSessions.some(
          (x) => s < new Date(x.occupiedUntil).getTime() && s + occupiedMs > new Date(x.startTime).getTime()
        );
        const clashesBlock = blocked.some((b) => s < b.end && e > b.start);

        if (!clashesBooking && !clashesBlock) slots.push(t.toUTC().toISO());
      }
    }
    day = day.plus({ days: 1 });
  }
  return slots;
}

// 5-minute cell numbers covered by [start, end). Start must sit on the grid.
function buildCells(startDate, endDate) {
  const startMin = Math.floor(startDate.getTime() / 60000);
  const endMin = Math.floor(endDate.getTime() / 60000);
  if (startMin % GRID_MIN !== 0) throw Object.assign(new Error('Start time must be on a 5-minute mark'), { status: 400 });
  const cells = [];
  for (let m = startMin; m < endMin; m += GRID_MIN) cells.push(m / GRID_MIN);
  return cells;
}

const normalizeIso = (value) => {
  const dt = DateTime.fromISO(String(value), { setZone: true });
  return dt.isValid ? dt.toUTC().toISO() : null;
};

module.exports = { generateOpenSlots, buildCells, normalizeIso };
