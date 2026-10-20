'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/services/scheduler');

const MIN = 60 * 1000;
const T0 = Date.UTC(2030, 0, 7, 9, 0); // 09:00
const at = (h, m = 0) => Date.UTC(2030, 0, 7, h, m);

// 30 active -> 60 passive -> 30 active (the salon's "color" service)
const color = {
  phases: [
    { type: 'active', duration: 30 },
    { type: 'passive', duration: 60 },
    { type: 'active', duration: 30 },
  ],
  canOverlap: true,
  requiredStaff: 1,
  requiredSeats: 1,
};
const cut30 = { activeDuration: 30, passiveDuration: 0, canOverlap: false, requiredStaff: 1, requiredSeats: 1 };

/** Places a service and stores it like the controller does. */
function book(list, service, startMs, opts = {}) {
  const placement = S.tryPlace({ startMs, service, bookings: list, staffIds: opts.staffIds || [], seatCount: opts.seatCount ?? null });
  if (!placement.ok) return placement;
  list.push(
    S.hydrateBooking({
      startAt: new Date(placement.startMs),
      endAt: new Date(placement.endMs),
      schedule: S.buildSchedule(service, placement),
    })
  );
  return placement;
}

test('normalizePhases falls back to legacy active/passive and merges/drops phases', () => {
  assert.deepEqual(S.normalizePhases({ activeDuration: 30, passiveDuration: 60 }), [
    { type: 'active', duration: 30 },
    { type: 'passive', duration: 60 },
  ]);
  assert.deepEqual(S.normalizePhases({ activeDuration: 45, passiveDuration: 0 }), [{ type: 'active', duration: 45 }]);
  assert.deepEqual(
    S.normalizePhases({ phases: [{ type: 'active', duration: 10 }, { type: 'active', duration: 5 }, { type: 'passive', duration: 0 }] }),
    [{ type: 'active', duration: 15 }]
  );
});

test('validatePhases rejects bad input', () => {
  assert.equal(S.validatePhases([]).ok, false);
  assert.equal(S.validatePhases([{ type: 'passive', duration: 30 }]).ok, false);
  assert.equal(S.validatePhases([{ type: 'active', duration: -1 }]).ok, false);
  assert.equal(S.validatePhases([{ type: 'nap', duration: 5 }]).ok, false);
  assert.equal(S.validatePhases([{ type: 'active', duration: 30 }, { type: 'passive', duration: 60 }, { type: 'active', duration: 30 }]).ok, true);
});

test('totals', () => {
  assert.deepEqual(S.totals(S.normalizePhases(color)), { activeDuration: 60, passiveDuration: 60, totalDuration: 120 });
});

test('two short services fit into the passive window of a color service (single staff)', () => {
  const list = [];
  assert.equal(book(list, color, at(10)).ok, true); // 10:00-12:00, passive 10:30-11:30
  assert.equal(book(list, cut30, at(10, 30)).ok, true); // 10:30-11:00 inside passive
  assert.equal(book(list, cut30, at(11)).ok, true); // 11:00-11:30 inside passive
});

test('active phases never overlap on the same staff', () => {
  const list = [];
  book(list, color, at(10));
  assert.equal(book(list, cut30, at(10)).ok, false); // collides with first active
  assert.equal(book(list, cut30, at(10, 15)).ok, false); // partly in first active
  assert.equal(book(list, cut30, at(11, 15)).ok, false); // partly in second active (11:30)
  assert.equal(book(list, cut30, at(11, 30)).ok, false); // exactly second active
  assert.equal(book(list, cut30, at(12)).ok, true); // after everything
});

test('a second color service can interleave: its active phases fit the other one\'s passive', () => {
  const list = [];
  book(list, color, at(10)); // A: 10-10:30, P 10:30-11:30, A 11:30-12
  const second = book(list, color, at(10, 30)); // A: 10:30-11, P 11-12, A 12-12:30
  assert.equal(second.ok, true);
  // third color at 11:00: actives 11:00-11:30 and 12:30-13:00 both fall into free gaps -> perfect interleave
  assert.equal(book(list, color, at(11)).ok, true);
  // fourth color at 11:15 collides with #3's first active (11:00-11:30)
  assert.equal(book(list, color, at(11, 15)).ok, false);
});

test('canOverlap = false blocks the staff for the whole duration', () => {
  const list = [];
  const strict = { ...color, canOverlap: false };
  book(list, strict, at(10));
  assert.equal(book(list, cut30, at(10, 30)).ok, false);
});

test('multiple staff can work active phases in parallel', () => {
  const list = [];
  const staffIds = [1, 2];
  assert.equal(book(list, cut30, at(10), { staffIds }).ok, true);
  assert.equal(book(list, cut30, at(10), { staffIds }).ok, true);
  assert.equal(book(list, cut30, at(10), { staffIds }).ok, false); // both busy
});

test('requiredStaff > 1 needs that many free staff during active phases', () => {
  const list = [];
  const duo = { ...cut30, requiredStaff: 2 };
  assert.equal(book(list, duo, at(10), { staffIds: [1] }).ok, false);
  assert.equal(book(list, duo, at(10), { staffIds: [1, 2] }).ok, true);
  assert.equal(book(list, cut30, at(10), { staffIds: [1, 2] }).ok, false);
});

test('seat limit counts the whole duration, including passive', () => {
  const list = [];
  const opts = { staffIds: [1, 2, 3], seatCount: 2 };
  assert.equal(book(list, color, at(10), opts).ok, true);
  assert.equal(book(list, color, at(10, 30), opts).ok, true);
  assert.equal(book(list, cut30, at(11), opts).ok, false); // 2 seats taken by both colors
  assert.equal(book(list, cut30, at(12), opts).ok, true);
});

test('legacy bookings without schedule block everything', () => {
  const legacy = S.hydrateBooking({ startAt: new Date(at(10)), endAt: new Date(at(11)), schedule: null });
  const r = S.tryPlace({ startMs: at(10, 30), service: cut30, bookings: [legacy], staffIds: [1, 2] });
  assert.equal(r.ok, false);
  assert.equal(S.tryPlace({ startMs: at(11), service: cut30, bookings: [legacy], staffIds: [1, 2] }).ok, true);
});

test('generateSlots respects closing time and existing bookings', () => {
  const list = [];
  book(list, color, at(10));
  const slots = S.generateSlots({
    openMs: at(9),
    closeMs: at(13),
    nowMs: 0,
    service: cut30,
    bookings: list,
    staffIds: [],
  });
  const starts = slots.map((s) => new Date(s.startAt).getUTCHours() * 60 + new Date(s.startAt).getUTCMinutes());
  assert.ok(starts.includes(9 * 60 + 30)); // 9:30-10:00 right before color
  assert.ok(!starts.includes(10 * 60)); // collides with first active
  assert.ok(starts.includes(10 * 60 + 30)); // inside passive
  assert.ok(starts.includes(11 * 60)); // inside passive
  assert.ok(!starts.includes(11 * 60 + 15)); // overlaps second active
  assert.ok(starts.includes(12 * 60)); // after
  assert.ok(starts.includes(12 * 60 + 30)); // last start that ends by 13:00
  assert.ok(!starts.includes(12 * 60 + 45)); // would end after closing
});
