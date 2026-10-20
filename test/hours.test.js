'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/services/hours');

test('opening hours are interpreted in the salon timezone (DST aware)', () => {
  const summer = H.getDayWindow({ timezone: 'Europe/Sarajevo', daysOfOperation: { monday: { enabled: true, open: '09:00', close: '17:00' } } }, '2030-07-01');
  assert.equal(summer.open.toISOString(), '2030-07-01T07:00:00.000Z'); // UTC+2
  const winter = H.getDayWindow({ timezone: 'Europe/Sarajevo', daysOfOperation: { tuesday: { enabled: true, open: '09:00', close: '17:00' } } }, '2030-01-01');
  assert.equal(winter.open.toISOString(), '2030-01-01T08:00:00.000Z'); // UTC+1
  const ny = H.getDayWindow({ timezone: 'America/New_York', daysOfOperation: {} }, '2030-07-01');
  assert.equal(ny.open.toISOString(), '2030-07-01T13:00:00.000Z'); // default 09:00, UTC-4
});

test('dateStringInZone and parseDateOnly', () => {
  assert.equal(H.dateStringInZone(Date.UTC(2030, 0, 1, 23, 30), 'Europe/Sarajevo'), '2030-01-02');
  assert.equal(H.parseDateOnly('2030-02-30'), null);
  assert.equal(H.parseDateOnly('2030-02-28'), '2030-02-28');
  assert.equal(H.isValidTimeZone('Mars/Base'), false);
});
