'use strict';

/**
 * Scheduling engine: active / passive service phases.
 *
 * A service is an ordered list of phases, e.g. 30 min active -> 60 min passive -> 30 min active.
 * - ACTIVE phase: a staff member works on the customer (staff is busy).
 * - PASSIVE phase: the customer waits (dye developing, mask, ...). Staff is free and may
 *   work on OTHER bookings, as long as those bookings' active phases fall into it.
 *
 * Rules enforced here:
 *  1. Two ACTIVE phases of the same staff member never overlap.
 *  2. A passive phase can host any number of other bookings' active phases (no cap),
 *     unless the service has canOverlap = false, in which case the whole service blocks the staff.
 *  3. Optional seat limit: seats are occupied for the whole service duration (active + passive).
 *     seatCount = null means unlimited seats.
 *  4. requiredStaff > 1: that many distinct staff members work together during every active phase.
 */

const MIN = 60 * 1000;
const IMPLICIT_STAFF_ID = 0; // salon with no team members == one implicit staff member (the owner)

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** Parses JSON columns that some DB drivers return as strings (MariaDB LONGTEXT). */
function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

/**
 * Returns a clean list of phases for a service. Uses `service.phases` when it is a valid list,
 * otherwise falls back to the legacy [active, passive] pair. Adjacent phases of the same type
 * are merged; zero-length phases are dropped; a service always starts and ends with an active phase
 * only if the owner defines it that way (we do not force it).
 */
function normalizePhases(service) {
  const raw = parseJson(service.phases, null);
  let phases = [];

  if (Array.isArray(raw) && raw.length) {
    phases = raw.map((p) => ({
      type: p && p.type === 'passive' ? 'passive' : 'active',
      duration: toInt(p && p.duration),
    }));
  } else {
    phases = [
      { type: 'active', duration: toInt(service.activeDuration) },
      { type: 'passive', duration: toInt(service.passiveDuration) },
    ];
  }

  const merged = [];
  for (const p of phases) {
    if (p.duration <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && last.type === p.type) last.duration += p.duration;
    else merged.push({ ...p });
  }
  return merged;
}

/** Validates a phases array coming from the client. Returns { ok, error, phases }. */
function validatePhases(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'phases must be a non-empty array' };
  }
  if (input.length > 12) return { ok: false, error: 'A service can have at most 12 phases' };
  for (const p of input) {
    if (!p || (p.type !== 'active' && p.type !== 'passive')) {
      return { ok: false, error: 'Each phase needs type "active" or "passive"' };
    }
    const d = Number(p.duration);
    if (!Number.isInteger(d) || d < 0 || d > 600) {
      return { ok: false, error: 'Phase duration must be a whole number of minutes between 0 and 600' };
    }
  }
  const phases = normalizePhases({ phases: input });
  if (!phases.some((p) => p.type === 'active')) {
    return { ok: false, error: 'A service needs at least one active phase' };
  }
  return { ok: true, phases };
}

/** Totals derived from phases; kept in activeDuration / passiveDuration columns for compatibility. */
function totals(phases) {
  let active = 0;
  let passive = 0;
  for (const p of phases) {
    if (p.type === 'active') active += p.duration;
    else passive += p.duration;
  }
  return { activeDuration: active, passiveDuration: passive, totalDuration: active + passive };
}

/** Absolute intervals (ms) for each phase when the service starts at startMs. */
function phaseIntervals(startMs, phases) {
  let cursor = startMs;
  return phases.map((p) => {
    const interval = { type: p.type, start: cursor, end: cursor + p.duration * MIN };
    cursor = interval.end;
    return interval;
  });
}

/** Intervals during which the staff member is NOT free. */
function blockingIntervals(intervals, canOverlap) {
  return canOverlap ? intervals.filter((i) => i.type === 'active') : intervals;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Turns a DB booking into the shape the engine needs.
 * Bookings created before the phase model existed (no schedule snapshot) become one solid
 * block that occupies every staff member - the safe/conservative interpretation.
 */
function hydrateBooking(booking) {
  const startMs = new Date(booking.startAt).getTime();
  const endMs = new Date(booking.endAt).getTime();
  const schedule = parseJson(booking.schedule, null);

  if (schedule && Array.isArray(schedule.phases) && schedule.phases.length) {
    const phases = normalizePhases({ phases: schedule.phases });
    return {
      start: startMs,
      end: endMs,
      intervals: phaseIntervals(startMs, phases),
      canOverlap: !!schedule.canOverlap,
      staffIds: Array.isArray(schedule.staffIds) ? schedule.staffIds : null,
      seats: Math.max(1, toInt(schedule.requiredSeats, 1)),
    };
  }

  return {
    start: startMs,
    end: endMs,
    intervals: [{ type: 'active', start: startMs, end: endMs }],
    canOverlap: false,
    staffIds: null, // unknown -> blocks everybody
    seats: 1,
  };
}

function staffBusy(staffId, blockWindows, bookings) {
  for (const b of bookings) {
    if (b.staffIds && !b.staffIds.includes(staffId)) continue;
    const theirs = blockingIntervals(b.intervals, b.canOverlap);
    for (const mine of blockWindows) {
      if (theirs.some((t) => overlaps(mine, t))) return true;
    }
  }
  return false;
}

/** Peak number of seats in use inside [start,end) given the bookings (whole duration counts). */
function seatsFree(seatCount, start, end, bookings, needed) {
  if (seatCount === null || seatCount === undefined) return true;
  const relevant = bookings.filter((b) => b.start < end && b.end > start);
  const points = new Set([start]);
  relevant.forEach((b) => {
    if (b.start > start && b.start < end) points.add(b.start);
  });
  for (const t of points) {
    const used = relevant.filter((b) => b.start <= t && b.end > t).reduce((s, b) => s + b.seats, 0);
    if (used + needed > seatCount) return false;
  }
  return true;
}

/**
 * Does a hydrated booking occupy staff member `memberId` (null = any member) during [startMs, endMs)?
 * Used to refuse blocking time that already has appointments in it.
 */
function bookingTouchesWindow(booking, memberId, startMs, endMs) {
  if (memberId !== null && memberId !== undefined && booking.staffIds && !booking.staffIds.includes(memberId)) return false;
  const window = { start: startMs, end: endMs };
  return blockingIntervals(booking.intervals, booking.canOverlap).some((i) => overlaps(i, window));
}

/**
 * Can `service` start at `startMs`? Returns { ok, staffIds, intervals, reason }.
 *
 * @param {object} opts
 * @param {number} opts.startMs
 * @param {object} opts.service         - { phases|activeDuration/passiveDuration, canOverlap, requiredStaff, requiredSeats }
 * @param {Array}  opts.bookings        - hydrated bookings (see hydrateBooking) that may overlap in time
 * @param {number[]} opts.staffIds      - ids of the salon's staff (empty -> one implicit staff member)
 * @param {number|null} opts.seatCount  - salon seats, null = unlimited
 * @param {number} [opts.preferredStaffId]
 */
function tryPlace({ startMs, service, bookings, staffIds, seatCount = null, preferredStaffId }) {
  const phases = normalizePhases(service);
  const { totalDuration } = totals(phases);
  if (!phases.some((p) => p.type === 'active') || totalDuration <= 0) {
    return { ok: false, reason: 'Service has no duration' };
  }

  const endMs = startMs + totalDuration * MIN;
  const intervals = phaseIntervals(startMs, phases);
  const canOverlap = !!service.canOverlap;
  const window = blockingIntervals(intervals, canOverlap);
  const needStaff = Math.max(1, toInt(service.requiredStaff, 1));
  const needSeats = Math.max(1, toInt(service.requiredSeats, 1));

  const pool = staffIds && staffIds.length ? staffIds : [IMPLICIT_STAFF_ID];
  if (pool.length < needStaff) {
    return { ok: false, reason: `Service needs ${needStaff} staff members but the salon has ${pool.length}` };
  }
  if (seatCount !== null && seatCount !== undefined && needSeats > seatCount) {
    return { ok: false, reason: 'Service needs more seats than the salon has' };
  }

  const relevant = bookings.filter((b) => b.start < endMs && b.end > startMs);

  if (!seatsFree(seatCount, startMs, endMs, relevant, needSeats)) {
    return { ok: false, reason: 'No free seat' };
  }

  let candidates = pool.filter((id) => !staffBusy(id, window, relevant));
  if (preferredStaffId !== undefined && preferredStaffId !== null) {
    if (!pool.includes(preferredStaffId)) return { ok: false, reason: 'Selected staff member not found' };
    if (!candidates.includes(preferredStaffId)) return { ok: false, reason: 'Selected staff member is busy' };
    candidates = [preferredStaffId, ...candidates.filter((id) => id !== preferredStaffId)];
  }
  if (candidates.length < needStaff) return { ok: false, reason: 'No free staff member' };

  return {
    ok: true,
    staffIds: candidates.slice(0, needStaff),
    startMs,
    endMs,
    intervals,
    phases,
  };
}

/** Snapshot stored on the booking so later edits to the service never corrupt existing bookings. */
function buildSchedule(service, placement) {
  return {
    phases: placement.phases,
    canOverlap: !!service.canOverlap,
    requiredSeats: Math.max(1, toInt(service.requiredSeats, 1)),
    staffIds: placement.staffIds,
  };
}

/**
 * All bookable start times in [openMs, closeMs]. The whole service (active + passive) must
 * finish by closing time. Past starts are skipped (nowMs).
 */
function generateSlots({ openMs, closeMs, intervalMin = 15, nowMs = Date.now(), service, bookings, staffIds, seatCount, preferredStaffId }) {
  const phases = normalizePhases(service);
  const { totalDuration } = totals(phases);
  const slots = [];
  if (totalDuration <= 0) return slots;

  const step = Math.max(5, intervalMin) * MIN;
  for (let t = openMs; t + totalDuration * MIN <= closeMs; t += step) {
    if (t <= nowMs) continue;
    const placement = tryPlace({ startMs: t, service, bookings, staffIds, seatCount, preferredStaffId });
    if (placement.ok) {
      slots.push({
        startAt: new Date(placement.startMs).toISOString(),
        endAt: new Date(placement.endMs).toISOString(),
        phases: placement.intervals.map((i) => ({
          type: i.type,
          startAt: new Date(i.start).toISOString(),
          endAt: new Date(i.end).toISOString(),
        })),
        staffIds: placement.staffIds,
      });
    }
  }
  return slots;
}

module.exports = {
  IMPLICIT_STAFF_ID,
  parseJson,
  normalizePhases,
  validatePhases,
  totals,
  phaseIntervals,
  hydrateBooking,
  bookingTouchesWindow,
  tryPlace,
  buildSchedule,
  generateSlots,
};
