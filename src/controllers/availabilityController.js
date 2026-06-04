const { Op } = require('sequelize');
const { Booking, Salon, SalonService } = require('../models');

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';
const SLOT_INTERVAL_MIN = 15;

function parseTimeToDate(baseDate, timeHHmm) {
  const [hours, minutes] = timeHHmm.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateKeyFromDay(day) {
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[day];
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

exports.getSalonAvailability = async (req, res) => {
  try {
    const salon_id = Number(req.params.id);
    const { serviceId, date } = req.query;

    if (!serviceId || !date) {
      return res.status(400).json({ error: 'serviceId and date query params are required' });
    }

    const targetDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (targetDate < today) {
      return res.status(400).json({ error: 'Cannot fetch availability for past dates' });
    }

    const salon = await Salon.findByPk(salon_id);
    if (!salon) {
      return res.status(404).json({ error: 'Salon not found' });
    }

    const service = await SalonService.findOne({
      where: { id: Number(serviceId), salon_id },
    });
    if (!service) {
      return res.status(404).json({ error: 'Service not found for this salon' });
    }

    const dayKey = dateKeyFromDay(targetDate.getDay());
    const operationConfig = parseOperationDays(salon.daysOfOperation)?.[dayKey];
    const isEnabled = operationConfig?.enabled ?? true;
    if (!isEnabled) {
      return res.json({
        date,
        salon_id,
        serviceId: Number(serviceId),
        slotDurationMin: service.activeDuration + service.passiveDuration,
        slots: [],
      });
    }

    const openTime = operationConfig?.open || DEFAULT_OPEN;
    const closeTime = operationConfig?.close || DEFAULT_CLOSE;
    const openDate = parseTimeToDate(targetDate, openTime);
    const closeDate = parseTimeToDate(targetDate, closeTime);
    const slotDurationMs = (service.activeDuration + service.passiveDuration) * 60 * 1000;

    const existingBookings = await Booking.findAll({
      where: {
        salon_id,
        status: { [Op.notIn]: ['cancelled'] },
        [Op.and]: [
          { startAt: { [Op.lt]: closeDate } },
          { endAt: { [Op.gt]: openDate } },
        ],
      },
      attributes: ['startAt', 'endAt'],
    });

    const slots = [];
    for (
      let cursor = new Date(openDate);
      cursor.getTime() + slotDurationMs <= closeDate.getTime();
      cursor = new Date(cursor.getTime() + SLOT_INTERVAL_MIN * 60 * 1000)
    ) {
      const candidateStart = new Date(cursor);
      const candidateEnd = new Date(candidateStart.getTime() + slotDurationMs);
      const hasConflict = existingBookings.some((booking) => (
        new Date(booking.startAt) < candidateEnd && new Date(booking.endAt) > candidateStart
      ));

      if (!hasConflict) {
        slots.push({
          startAt: candidateStart.toISOString(),
          endAt: candidateEnd.toISOString(),
        });
      }
    }

    res.json({
      date,
      salon_id,
      serviceId: Number(serviceId),
      slotDurationMin: service.activeDuration + service.passiveDuration,
      slots,
    });
  } catch (error) {
    console.error('Error getting availability:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
};
