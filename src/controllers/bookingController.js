const { Op } = require('sequelize');
const { Booking, Salon, SalonService, User } = require('../models');

const OWNER_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'];
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

function dateKeyFromDay(day) {
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[day];
}

function parseTimeToDate(baseDate, timeHHmm) {
  const [hours, minutes] = String(timeHHmm || '').split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(Number.isNaN(hours) ? 0 : hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
  return date;
}

function parseOperationDays(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

exports.createBooking = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { salon_id, serviceId, startAt, note } = req.body;

    if (!salon_id || !serviceId || !startAt) {
      return res.status(400).json({ error: 'salon_id, serviceId and startAt are required' });
    }

    const salon = await Salon.findByPk(salon_id);
    if (!salon) {
      return res.status(404).json({ error: 'Salon not found' });
    }

    const service = await SalonService.findOne({
      where: { id: serviceId, salon_id },
    });

    if (!service) {
      return res.status(404).json({ error: 'Service not found for this salon' });
    }

    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid startAt date' });
    }

    if (startDate <= new Date()) {
      return res.status(400).json({ error: 'Booking start time must be in the future' });
    }

    const totalDurationMin = service.activeDuration + service.passiveDuration;
    if (!Number.isFinite(totalDurationMin) || totalDurationMin <= 0) {
      return res.status(400).json({ error: 'Service duration must be greater than zero' });
    }

    const endDate = new Date(startDate.getTime() + totalDurationMin * 60 * 1000);
    const dayKey = dateKeyFromDay(startDate.getDay());
    const operationSource = parseOperationDays(salon.daysOfOperation);
    const operationConfig = operationSource[dayKey];

    if (operationConfig?.enabled === false) {
      return res.status(400).json({ error: 'Salon is closed on selected day' });
    }

    const openDate = parseTimeToDate(startDate, operationConfig?.open || DEFAULT_OPEN);
    const closeDate = parseTimeToDate(startDate, operationConfig?.close || DEFAULT_CLOSE);
    if (startDate < openDate || endDate > closeDate) {
      return res.status(400).json({ error: 'Selected time is outside salon working hours' });
    }

    const conflictingBooking = await Booking.findOne({
      where: {
        salon_id,
        status: { [Op.notIn]: ['cancelled'] },
        [Op.and]: [
          { startAt: { [Op.lt]: endDate } },
          { endAt: { [Op.gt]: startDate } },
        ],
      },
    });

    if (conflictingBooking) {
      return res.status(409).json({ error: 'Selected time conflicts with another booking' });
    }

    const booking = await Booking.create({
      salon_id,
      customerId,
      serviceId,
      startAt: startDate,
      endAt: endDate,
      totalPrice: service.price,
      note: note || null,
      status: 'pending',
    });

    res.status(201).json(booking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const customerId = req.user.id;
    const bookings = await Booking.findAll({
      where: { customerId },
      include: [
        { model: Salon, attributes: ['id', 'businessName', 'address', 'city'] },
        { model: SalonService, as: 'service', attributes: ['id', 'name', 'activeDuration', 'passiveDuration', 'price'] },
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
    const customerId = req.user.id;
    const bookingId = req.params.id;

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.customerId !== customerId) {
      return res.status(403).json({ error: 'Not allowed to cancel this booking' });
    }

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({ error: 'This booking cannot be cancelled' });
    }

    await booking.update({ status: 'cancelled' });
    res.json(booking);
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

exports.getSalonBookings = async (req, res) => {
  try {
    const salon_id = req.salon.id;
    const bookings = await Booking.findAll({
      where: { salon_id },
      include: [
        { model: SalonService, as: 'service', attributes: ['id', 'name', 'price', 'activeDuration', 'passiveDuration'] },
        { model: User, as: 'customer', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
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
    const salon_id = req.salon.id;
    const bookingId = req.params.id;
    const { status } = req.body;

    if (!status || !OWNER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await Booking.findOne({
      where: { id: bookingId, salon_id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await booking.update({ status });
    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};
