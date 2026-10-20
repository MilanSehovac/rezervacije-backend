'use strict';

const scheduler = require('./scheduler');
const { isValidTimeZone } = require('./hours');

const CATEGORIES = ['barber', 'hair-salon', 'nail-salon', 'spa', 'beauty-salon'];
const PRICE_RANGES = ['$', '$$', '$$$'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const optStr = (v, max) => {
  const s = str(v, max);
  return s === undefined || s === '' ? null : s;
};

/** Validates the weekly opening hours object. Returns { ok, error, value }. */
function validateDaysOfOperation(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'daysOfOperation is required' };
  const value = {};
  for (const day of DAYS) {
    const cfg = input[day];
    if (!cfg) continue;
    const enabled = cfg.enabled !== false;
    if (!TIME_RE.test(cfg.open) || !TIME_RE.test(cfg.close)) {
      return { ok: false, error: `Invalid opening hours for ${day} (use HH:mm)` };
    }
    if (enabled && cfg.open >= cfg.close) {
      return { ok: false, error: `Opening time must be before closing time on ${day}` };
    }
    value[day] = { enabled, open: cfg.open, close: cfg.close };
  }
  return { ok: true, value };
}

/**
 * Validates one service payload. `phases` (preferred) or legacy activeDuration/passiveDuration.
 * Returns { ok, error, value } where value is ready for SalonService.create/update.
 */
function validateService(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid service' };
  const value = {};

  if (!partial || input.name !== undefined) {
    const name = str(input.name, 100);
    if (!name) return { ok: false, error: 'Service name is required' };
    value.name = name;
  }

  if (!partial || input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000) return { ok: false, error: 'Invalid service price' };
    value.price = price;
  }

  if (input.phases !== undefined || !partial) {
    let phasesInput = input.phases;
    if (phasesInput === undefined || phasesInput === null) {
      phasesInput = [
        { type: 'active', duration: Number(input.activeDuration) || 0 },
        { type: 'passive', duration: Number(input.passiveDuration) || 0 },
      ];
    }
    const checked = scheduler.validatePhases(phasesInput);
    if (!checked.ok) return checked;
    const t = scheduler.totals(checked.phases);
    value.phases = checked.phases;
    value.activeDuration = t.activeDuration;
    value.passiveDuration = t.passiveDuration;
  }

  for (const [key, min, max] of [['requiredStaff', 1, 10], ['requiredSeats', 1, 10]]) {
    if (input[key] !== undefined) {
      const n = Number(input[key]);
      if (!Number.isInteger(n) || n < min || n > max) return { ok: false, error: `${key} must be between ${min} and ${max}` };
      value[key] = n;
    }
  }
  if (input.canOverlap !== undefined) value.canOverlap = !!input.canOverlap;

  // Preset key such as 'hair_coloring'. Numeric ids from the client are never trusted.
  if (input.serviceKey !== undefined || input.id !== undefined) {
    const key =
      typeof input.serviceKey === 'string'
        ? input.serviceKey
        : typeof input.id === 'string' && !/^\d+$/.test(input.id)
        ? input.id
        : '';
    value.serviceKey = key.slice(0, 100);
  }
  return { ok: true, value };
}

function validateTeamMember(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid team member' };
  const value = {};
  if (!partial || input.name !== undefined) {
    const name = str(input.name, 100);
    if (!name) return { ok: false, error: 'Team member name is required' };
    value.name = name;
  }
  if (!partial || input.role !== undefined) {
    const role = str(input.role, 50);
    if (!role) return { ok: false, error: 'Team member role is required' };
    value.role = role;
  }
  if (input.specialties !== undefined) value.specialties = optStr(input.specialties, 255);
  return { ok: true, value };
}

/** Whitelisted salon fields (no isApproved / userId from the client). Returns { ok, error, value }. */
function validateSalon(input, { partial = false } = {}) {
  const value = {};
  const required = { businessName: 255, email: 100, phone: 20 };
  for (const [key, max] of Object.entries(required)) {
    if (!partial || input[key] !== undefined) {
      const v = str(input[key], max);
      if (!v) return { ok: false, error: `${key} is required` };
      value[key] = v;
    }
  }
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return { ok: false, error: 'Invalid email' };

  if (!partial || input.category !== undefined) {
    if (!CATEGORIES.includes(input.category)) return { ok: false, error: 'Invalid category' };
    value.category = input.category;
  }
  if (input.priceRange !== undefined) {
    if (!PRICE_RANGES.includes(input.priceRange)) return { ok: false, error: 'Invalid price range' };
    value.priceRange = input.priceRange;
  }

  const textFields = {
    description: 5000, website: 255, instagram: 255, facebook: 255, twitter: 255,
    address: 255, city: 100, state: 100, zipCode: 20, cancellationPolicy: 5000,
  };
  for (const [key, max] of Object.entries(textFields)) {
    if (input[key] !== undefined) value[key] = optStr(input[key], max);
  }

  if (input.specialties !== undefined) {
    if (!Array.isArray(input.specialties)) return { ok: false, error: 'specialties must be an array' };
    value.specialties = input.specialties
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim().slice(0, 100))
      .slice(0, 30);
  }
  if (input.images !== undefined) {
    // URLs only: the API has no file upload yet and File objects serialise to {}
    value.images = Array.isArray(input.images)
      ? input.images.filter((i) => typeof i === 'string' && /^https?:\/\//.test(i)).slice(0, 10)
      : [];
  }
  if (input.daysOfOperation !== undefined || !partial) {
    const days = validateDaysOfOperation(input.daysOfOperation);
    if (!days.ok) return days;
    value.daysOfOperation = days.value;
  }
  if (input.autoConfirm !== undefined) {
    if (typeof input.autoConfirm !== 'boolean') return { ok: false, error: 'autoConfirm must be true or false' };
    value.autoConfirm = input.autoConfirm;
  }
  for (const key of ['minNoticeHours', 'cancellationHours']) {
    if (input[key] !== undefined) {
      const n = Number(input[key]);
      if (!Number.isInteger(n) || n < 0 || n > 720) return { ok: false, error: `${key} must be a whole number of hours between 0 and 720` };
      value[key] = n;
    }
  }
  if (input.timezone !== undefined) {
    if (!isValidTimeZone(input.timezone)) return { ok: false, error: 'Invalid timezone (use an IANA name such as Europe/Sarajevo)' };
    value.timezone = input.timezone;
  }
  if (input.seats !== undefined) {
    if (input.seats === null || input.seats === '') value.seats = null;
    else {
      const n = Number(input.seats);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return { ok: false, error: 'seats must be a positive whole number or empty (unlimited)' };
      }
      value.seats = n;
    }
  }
  return { ok: true, value };
}

module.exports = { validateSalon, validateService, validateTeamMember, validateDaysOfOperation };
