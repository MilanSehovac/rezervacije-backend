const { Op } = require('sequelize');
const { Booking, Salon, SalonService, User, Review, Notification, sequelize } = require('../models');
const scheduler = require('../services/scheduler');
const { getDayWindow, dateStringInZone, isValidTimeZone, DEFAULT_TIMEZONE } = require('../services/hours');
const { loadEngineBookings, loadStaffIds, INACTIVE_STATUSES } = require('../services/loaders');
const { events, loadForNotification } = require('../services/notifications');

const OWNER_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'];
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];
const FINAL_STATUSES = ['cancelled', 'completed', 'no_show'];
const REQUIRES_STARTED = ['completed', 'no_show'];
const MAX_NOTE_LENGTH = 500;
const MAX_ADVANCE_DAYS = 180;
const HOUR = 60 * 60 * 1000;

class BookingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const optionalId = (v) => (v !== undefined && v !== null && v !== '' ? Number(v) : undefined);

function parseStart(startAt) {
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) throw new BookingError(400, 'Invalid startAt date');
  return startDate;
}

/**
 * Finds room for `service` at `startDate` inside an open transaction.
 * Checks opening hours, advance limit, optionally the minimum notice, and asks the scheduler for free staff/seats.
 * Throws BookingError when it does not fit. `excludeBookingId` is used when moving an existing booking.
 */
async function findPlacement({ salon, service, startDate, staffId, transaction, enforceNotice, excludeBookingId }) {
  const phases = scheduler.normalizePhases(service);
  const { totalDuration } = scheduler.totals(phases);
  if (!phases.some((p) => p.type === 'active') || totalDuration <= 0) {
    throw new BookingError(400, 'Service duration must be greater than zero');
  }

  const now = Date.now();
  if (enforceNotice) {
    if (startDate.getTime() <= now) throw new BookingError(400, 'Booking start time must be in the future');
    if (startDate.getTime() < now + salon.minNoticeHours * HOUR) {
      throw new BookingError(400, `This salon needs at least ${salon.minNoticeHours} hour(s) notice for a booking`);
    }
  }
  if (startDate.getTime() > now + MAX_ADVANCE_DAYS * 24 * HOUR) {
    throw new BookingError(400, `Bookings can be made at most ${MAX_ADVANCE_DAYS} days ahead`);
  }

  const timezone = isValidTimeZone(salon.timezone) ? salon.timezone : DEFAULT_TIMEZONE;
  const window = getDayWindow(salon, dateStringInZone(startDate.getTime(), timezone));
  if (!window.enabled) throw new BookingError(400, 'Salon is closed on selected day');

  const endMs = startDate.getTime() + totalDuration * 60 * 1000;
  if (startDate < window.open || endMs > window.close.getTime()) {
    throw new BookingError(400, 'Selected time is outside salon working hours');
  }

  const staffIds = await loadStaffIds(salon.id, transaction);
  const existing = await loadEngineBookings(salon.id, startDate, new Date(endMs), transaction, excludeBookingId);
  const placement = scheduler.tryPlace({
    startMs: startDate.getTime(),
    service,
    bookings: existing,
    staffIds,
    seatCount: salon.seats,
    preferredStaffId: staffId,
  });
  if (!placement.ok) throw new BookingError(409, `Selected time is not available (${placement.reason})`);
  return placement;
}

/** A customer cannot be in two places at once. */
async function assertCustomerFree(customerId, startDate, endDate, transaction, excludeBookingId) {
  const where = {
    customerId,
    status: { [Op.notIn]: INACTIVE_STATUSES },
    startAt: { [Op.lt]: endDate },
    endAt: { [Op.gt]: startDate },
  };
  if (excludeBookingId) where.id = { [Op.ne]: excludeBookingId };
  if (await Booking.findOne({ where, transaction })) {
    throw new BookingError(409, 'You already have another booking at that time');
  }
}

/** Cancel / reschedule are refused inside the salon's cancellation window. */
function assertWithinCancellationWindow(booking, salon) {
  if (salon.cancellationHours > 0 && new Date(booking.startAt).getTime() - Date.now() < salon.cancellationHours * HOUR) {
    throw new BookingError(
      400,
      `This salon only allows changes at least ${salon.cancellationHours} hour(s) before the appointment. Please contact the salon.`
    );
  }
}

const sendError = (res, error, logMessage) => {
  if (error instanceof BookingError) return res.status(error.status).json({ error: error.message });
  console.error(logMessage, error);
  return res.status(500).json({ error: 'Something went wrong' });
};

/**
 * Creates a booking. The salon row is locked for the duration of the transaction so two customers
 * cannot both grab the same free gap (check-then-insert race).
 */
exports.createBooking = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { salonId, serviceId, startAt, note } = req.body;

    if (!salonId || !serviceId || !startAt) {
      return res.status(400).json({ error: 'salonId, serviceId and startAt are required' });
    }
    if (note && String(note).length > MAX_NOTE_LENGTH) {
      return res.status(400).json({ error: `Note can be at most ${MAX_NOTE_LENGTH} characters` });
    }
    const startDate = parseStart(startAt);

    const booking = await sequelize.transaction(async (transaction) => {
      const salon = await Salon.findByPk(salonId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!salon || !salon.isApproved) throw new BookingError(404, 'Salon not found');
      if (salon.userId === customerId) {
        throw new BookingError(400, 'You cannot book your own salon. Use "Add booking" in your dashboard.');
      }

      const service = await SalonService.findOne({ where: { id: serviceId, salon_id: salon.id, isActive: true }, transaction });
      if (!service) throw new BookingError(404, 'Service not found for this salon');

      const placement = await findPlacement({
        salon, service, startDate, staffId: optionalId(req.body.staffId), transaction, enforceNotice: true,
      });
      await assertCustomerFree(customerId, startDate, new Date(placement.endMs), transaction);

      return Booking.create(
        {
          salonId: salon.id,
          customerId,
          serviceId: service.id,
          startAt: startDate,
          endAt: new Date(placement.endMs),
          totalPrice: service.price,
          note: note || null,
          status: salon.autoConfirm ? 'confirmed' : 'pending',
          source: 'online',
          schedule: scheduler.buildSchedule(service, placement),
        },
        { transaction }
      );
    });

    loadForNotification(booking.id)
      .then(async (full) => {
        if (!full) return;
        await events.requested(full, { auto: booking.status === 'confirmed' });
        if (booking.status === 'confirmed') await events.confirmed(full);
      })
      .catch(() => {});
    res.status(201).json(booking);
  } catch (error) {
    sendError(res, error, 'Error creating booking:');
  }
};

/**
 * Owner enters a booking for someone without an account (walk-in, phone call).
 * No notice period and no customer overlap check; it is confirmed straight away.
 */
exports.createManualBooking = async (req, res) => {
  try {
    const { serviceId, startAt, note } = req.body;
    const guestName = typeof req.body.guestName === 'string' ? req.body.guestName.trim().slice(0, 100) : '';
    const guestPhone = typeof req.body.guestPhone === 'string' ? req.body.guestPhone.trim().slice(0, 30) : '';
    if (!serviceId || !startAt) return res.status(400).json({ error: 'serviceId and startAt are required' });
    if (!guestName) return res.status(400).json({ error: 'Enter the customer name' });
    if (note && String(note).length > MAX_NOTE_LENGTH) {
      return res.status(400).json({ error: `Note can be at most ${MAX_NOTE_LENGTH} characters` });
    }
    const startDate = parseStart(startAt);

    const booking = await sequelize.transaction(async (transaction) => {
      const salon = await Salon.findByPk(req.salon.id, { transaction, lock: transaction.LOCK.UPDATE });
      const service = await SalonService.findOne({ where: { id: serviceId, salon_id: salon.id, isActive: true }, transaction });
      if (!service) throw new BookingError(404, 'Service not found for this salon');

      const placement = await findPlacement({
        salon, service, startDate, staffId: optionalId(req.body.staffId), transaction, enforceNotice: false,
      });
      return Booking.create(
        {
          salonId: salon.id,
          customerId: null,
          guestName,
          guestPhone: guestPhone || null,
          serviceId: service.id,
          startAt: startDate,
          endAt: new Date(placement.endMs),
          totalPrice: service.price,
          note: note || null,
          status: 'confirmed',
          source: 'manual',
          schedule: scheduler.buildSchedule(service, placement),
        },
        { transaction }
      );
    });
    res.status(201).json(booking);
  } catch (error) {
    sendError(res, error, 'Error creating manual booking:');
  }
};

/** Customer moves their own booking to another free slot. */
exports.rescheduleBooking = async (req, res) => {
  try {
    const startDate = parseStart(req.body.startAt);

    const booking = await sequelize.transaction(async (transaction) => {
      const found = await Booking.findByPk(req.params.id, { transaction });
      if (!found || found.customerId !== req.user.id) throw new BookingError(404, 'Booking not found');
      if (!CANCELLABLE_STATUSES.includes(found.status)) throw new BookingError(400, 'This booking can no longer be moved');

      const salon = await Salon.findByPk(found.salonId, { transaction, lock: transaction.LOCK.UPDATE });
      assertWithinCancellationWindow(found, salon);

      const service = await SalonService.findByPk(found.serviceId, { transaction });
      const placement = await findPlacement({
        salon, service, startDate, staffId: optionalId(req.body.staffId), transaction, enforceNotice: true, excludeBookingId: found.id,
      });
      await assertCustomerFree(req.user.id, startDate, new Date(placement.endMs), transaction, found.id);

      await found.update(
        {
          startAt: startDate,
          endAt: new Date(placement.endMs),
          schedule: scheduler.buildSchedule(service, placement),
          // a confirmed time that moved needs the salon's OK again, unless the salon confirms automatically
          status: salon.autoConfirm ? 'confirmed' : 'pending',
        },
        { transaction }
      );
      // reminders and the confirmation belonged to the old time
      await Notification.destroy({
        where: { bookingId: found.id, type: ['reminder_24h', 'reminder_1h', 'booking_confirmed'] },
        transaction,
      });
      return found;
    });

    loadForNotification(booking.id)
      .then(async (full) => {
        if (!full) return;
        await events.rescheduled(full);
        if (booking.status === 'confirmed') await events.confirmed(full);
      })
      .catch(() => {});
    res.json(booking);
  } catch (error) {
    sendError(res, error, 'Error rescheduling booking:');
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const customerId = req.user.id;
    const bookings = await Booking.findAll({
      where: { customerId },
      include: [
        { model: Salon, attributes: ['id', 'businessName', 'address', 'city', 'timezone', 'cancellationHours'] },
        { model: SalonService, as: 'service', attributes: ['id', 'name', 'activeDuration', 'passiveDuration', 'price'] },
        { model: Review, as: 'review', attributes: ['id', 'rating'], required: false },
      ],
      order: [['startAt', 'ASC']],
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error getting bookings:', error);
    res.status(500).json({ error: 'Failed to get bookings' });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking || booking.customerId !== req.user.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({ error: 'This booking cannot be cancelled' });
    }

    const salon = await Salon.findByPk(booking.salonId, { attributes: ['id', 'cancellationHours'] });
    assertWithinCancellationWindow(booking, salon);

    await booking.update({ status: 'cancelled' });
    loadForNotification(booking.id).then((full) => full && events.cancelledByCustomer(full)).catch(() => {});
    res.json(booking);
  } catch (error) {
    sendError(res, error, 'Error cancelling booking:');
  }
};

exports.getSalonBookings = async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      where: { salonId: req.salon.id },
      include: [
        { model: SalonService, as: 'service', attributes: ['id', 'name', 'price', 'activeDuration', 'passiveDuration'] },
        // required: false -> walk-in bookings have no customer account (User's default scope would turn this into an inner join)
        { model: User, as: 'customer', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'], required: false },
      ],
      order: [['startAt', 'DESC']],
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error getting salon bookings:', error);
    res.status(500).json({ error: 'Failed to get salon bookings' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !OWNER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await Booking.findOne({ where: { id: req.params.id, salonId: req.salon.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // A finished/cancelled booking must not be revived: its time may already be given to someone else.
    if (FINAL_STATUSES.includes(booking.status)) {
      return res.status(400).json({ error: `A ${booking.status} booking can no longer be changed` });
    }
    if (REQUIRES_STARTED.includes(status) && new Date(booking.startAt) > new Date()) {
      return res.status(400).json({ error: 'Cannot mark a future booking as completed or no-show' });
    }

    const previousStatus = booking.status;
    await booking.update({ status });
    loadForNotification(booking.id)
      .then((full) => {
        if (!full) return null;
        if (status === 'confirmed') return events.confirmed(full);
        if (status === 'cancelled') return events.declinedBySalon(full, previousStatus);
        if (status === 'completed') return events.completed(full);
        if (status === 'no_show') return events.noShow(full);
        return null;
      })
      .catch(() => {});
    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};
