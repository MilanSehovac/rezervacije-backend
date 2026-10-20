'use strict';

const { Op } = require('sequelize');
const { Notification, User, Booking, Salon, SalonService } = require('../models');
const { isValidTimeZone, DEFAULT_TIMEZONE } = require('./hours');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Which preference switch controls which notification type. Types not listed here are always delivered
// (e.g. a salon owner must always see a new booking request).
const PREF_FOR_TYPE = {
  booking_confirmed: 'statusUpdates',
  booking_declined: 'statusUpdates',
  booking_cancelled: 'statusUpdates',
  booking_completed: 'statusUpdates',
  booking_no_show: 'statusUpdates',
  reminder_24h: 'reminders',
  reminder_1h: 'reminders',
};

/** "Mon, 19 Oct, 10:00" in the salon's timezone. */
function formatWhen(date, timezone) {
  const timeZone = isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
  return new Date(date).toLocaleString('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Creates an in-app notification. Never throws: a failed notification must not break a booking.
 * Duplicates (same user + booking + type) are ignored thanks to a unique index.
 */
async function notify(userId, { type, title, message, bookingId = null, salonId = null, replace = false }, transaction) {
  try {
    if (!userId) return null;
    const prefKey = PREF_FOR_TYPE[type];
    if (prefKey) {
      const user = await User.findByPk(userId, { attributes: ['id', 'notificationPrefs'], transaction });
      if (!user || user.notificationPrefs[prefKey] === false) return null;
    }
    // a message that can legitimately happen again for the same booking (confirmed again after a reschedule)
    if (replace && bookingId) await Notification.destroy({ where: { userId, bookingId, type }, transaction });
    return await Notification.create(
      { userId, type, title: title.slice(0, 150), message: message.slice(0, 500), bookingId, salonId },
      { transaction }
    );
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') console.error('Failed to create notification:', error);
    return null;
  }
}

const customerName = (booking) =>
  booking.customer ? `${booking.customer.firstName} ${booking.customer.lastName}`.trim() : booking.guestName || 'A customer';

/** Booking events -> who gets told what. `booking` needs service, salon and customer loaded. */
const events = {
  requested: (booking, { auto = false } = {}) =>
    notify(booking.salon.userId, {
      type: 'booking_requested',
      title: auto ? 'New booking' : 'New booking request',
      message: auto
        ? `${customerName(booking)} booked ${booking.service.name} on ${formatWhen(booking.startAt, booking.salon.timezone)} (confirmed automatically).`
        : `${customerName(booking)} wants ${booking.service.name} on ${formatWhen(booking.startAt, booking.salon.timezone)}. Confirm or decline it in your dashboard.`,
      replace: true,
      bookingId: booking.id,
      salonId: booking.salonId,
    }),

  confirmed: (booking) =>
    notify(booking.customerId, {
      type: 'booking_confirmed',
      title: 'Booking confirmed',
      message: `${booking.salon.businessName} confirmed your ${booking.service.name} on ${formatWhen(booking.startAt, booking.salon.timezone)}.`,
      replace: true,
      bookingId: booking.id,
      salonId: booking.salonId,
    }),

  // the salon turned the booking down (it was still pending) or cancelled a confirmed one
  declinedBySalon: (booking, previousStatus) =>
    notify(booking.customerId, {
      type: previousStatus === 'pending' ? 'booking_declined' : 'booking_cancelled',
      title: previousStatus === 'pending' ? 'Booking declined' : 'Booking cancelled by the salon',
      message: `${booking.salon.businessName} could not take your ${booking.service.name} on ${formatWhen(booking.startAt, booking.salon.timezone)}. Please pick another time.`,
      bookingId: booking.id,
      salonId: booking.salonId,
    }),

  cancelledByCustomer: (booking) =>
    notify(booking.salon.userId, {
      type: 'booking_cancelled_by_customer',
      title: 'Booking cancelled',
      message: `${customerName(booking)} cancelled ${booking.service.name} on ${formatWhen(booking.startAt, booking.salon.timezone)}.`,
      bookingId: booking.id,
      salonId: booking.salonId,
    }),

  rescheduled: (booking) =>
    notify(booking.salon.userId, {
      type: 'booking_rescheduled',
      title: 'Booking moved',
      message: `${customerName(booking)} moved ${booking.service.name} to ${formatWhen(booking.startAt, booking.salon.timezone)}.${booking.status === 'pending' ? ' It needs your confirmation again.' : ''}`,
      bookingId: booking.id,
      salonId: booking.salonId,
      replace: true,
    }),

  completed: (booking) =>
    notify(booking.customerId, {
      type: 'booking_completed',
      title: 'Appointment completed',
      message: `Thanks for visiting ${booking.salon.businessName}! Tell others how it went by leaving a review.`,
      bookingId: booking.id,
      salonId: booking.salonId,
    }),

  noShow: (booking) =>
    notify(booking.customerId, {
      type: 'booking_no_show',
      title: 'Missed appointment',
      message: `${booking.salon.businessName} marked your ${booking.service.name} on ${formatWhen(booking.startAt, booking.salon.timezone)} as missed.`,
      bookingId: booking.id,
      salonId: booking.salonId,
    }),
};

/** Reloads a booking with everything the messages above need. */
function loadForNotification(bookingId) {
  return Booking.findByPk(bookingId, {
    include: [
      { model: Salon, as: 'salon' },
      { model: SalonService, as: 'service', attributes: ['name'] },
      { model: User, as: 'customer', attributes: ['id', 'firstName', 'lastName'], required: false },
    ],
  });
}

/**
 * Sends the "tomorrow" (24 h) and "soon" (1 h) reminders for confirmed bookings.
 * A reminder is only sent when the booking existed early enough: someone who books for in 3 hours
 * does not get a 24 h reminder, and a booking confirmed 20 minutes before start gets no 1 h reminder.
 */
async function sendDueReminders(now = Date.now()) {
  const bookings = await Booking.findAll({
    where: { status: 'confirmed', customerId: { [Op.ne]: null }, startAt: { [Op.gt]: new Date(now), [Op.lte]: new Date(now + 24 * HOUR) } },
    include: [
      { model: Salon, as: 'salon', attributes: ['id', 'businessName', 'timezone'] },
      { model: SalonService, as: 'service', attributes: ['name'] },
    ],
  });
  if (!bookings.length) return 0;

  const existing = await Notification.findAll({
    where: { bookingId: bookings.map((b) => b.id), type: ['reminder_24h', 'reminder_1h', 'booking_confirmed'] },
    attributes: ['bookingId', 'type', 'createdAt'],
  });
  const has = new Set(existing.map((n) => `${n.bookingId}:${n.type}`));
  const confirmedAt = new Map(existing.filter((n) => n.type === 'booking_confirmed').map((n) => [n.bookingId, n.createdAt.getTime()]));

  let sent = 0;
  for (const b of bookings) {
    const start = new Date(b.startAt).getTime();
    const remaining = start - now;
    const knownSince = confirmedAt.get(b.id) ?? new Date(b.createdAt).getTime();
    const when = formatWhen(b.startAt, b.salon.timezone);

    if (remaining <= 24 * HOUR && remaining > 2 * HOUR && knownSince <= start - 24 * HOUR && !has.has(`${b.id}:reminder_24h`)) {
      const n = await notify(b.customerId, {
        type: 'reminder_24h',
        title: 'Appointment tomorrow',
        message: `Reminder: ${b.service.name} at ${b.salon.businessName} on ${when}.`,
        bookingId: b.id,
        salonId: b.salonId,
      });
      if (n) sent++;
    }
    if (remaining <= HOUR && knownSince <= start - HOUR && !has.has(`${b.id}:reminder_1h`)) {
      const n = await notify(b.customerId, {
        type: 'reminder_1h',
        title: 'Appointment in about an hour',
        message: `Don't forget: ${b.service.name} at ${b.salon.businessName} starts at ${formatWhen(b.startAt, b.salon.timezone)}.`,
        bookingId: b.id,
        salonId: b.salonId,
      });
      if (n) sent++;
    }
  }
  return sent;
}

let timer = null;
function startReminderJob(intervalMs = MIN) {
  if (timer) return;
  const run = () => sendDueReminders().catch((e) => console.error('Reminder job failed:', e));
  run();
  timer = setInterval(run, intervalMs);
  timer.unref();
}

module.exports = { notify, events, formatWhen, loadForNotification, sendDueReminders, startReminderJob };
