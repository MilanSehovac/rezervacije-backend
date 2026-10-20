'use strict';

const { parseJson } = require('./scheduler');

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';
const DEFAULT_TIMEZONE = 'Europe/Sarajevo';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length > 0;
  } catch {
    return false;
  }
}

const formatters = new Map();
function partsIn(ms, tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(tz, f);
  }
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = Number(value);
  return p;
}

/** Offset (ms) of `tz` from UTC at the instant `ms`. */
function tzOffset(ms, tz) {
  const p = partsIn(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in `tz` -> UTC milliseconds (handles DST by re-checking the offset once). */
function zonedToUtcMs(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let result = guess - tzOffset(guess, tz);
  result = guess - tzOffset(result, tz);
  return result;
}

/** 'YYYY-MM-DD' of the instant as seen in `tz`. */
function dateStringInZone(ms, tz) {
  const p = partsIn(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Returns the same string when it is a real calendar date, otherwise null. */
function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return value;
}

/**
 * Working window of a salon on calendar day `dateStr` (YYYY-MM-DD) in the salon's own timezone.
 * Returns { enabled, open: Date, close: Date } (real instants).
 */
function getDayWindow(salon, dateStr) {
  const tz = isValidTimeZone(salon.timezone) ? salon.timezone : DEFAULT_TIMEZONE;
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const config = parseJson(salon.daysOfOperation, {})[DAY_KEYS[weekday]];
  const at = (hhmm) => {
    const [h, mi] = String(hhmm).split(':').map(Number);
    return new Date(zonedToUtcMs(y, m, d, h || 0, mi || 0, tz));
  };
  return {
    enabled: config ? config.enabled !== false : true,
    open: at((config && config.open) || DEFAULT_OPEN),
    close: at((config && config.close) || DEFAULT_CLOSE),
  };
}

module.exports = {
  DAY_KEYS, DEFAULT_TIMEZONE, isValidTimeZone, zonedToUtcMs, dateStringInZone, parseDateOnly, getDayWindow,
};
