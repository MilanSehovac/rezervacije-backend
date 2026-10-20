const { Salon, SalonService, Booking } = require('../models');
const { loadEngineBookings, loadStaffIds } = require('../services/loaders');
const scheduler = require('../services/scheduler');
const { parseDateOnly, getDayWindow, dateStringInZone, isValidTimeZone, DEFAULT_TIMEZONE } = require('../services/hours');

const SLOT_INTERVAL_MIN = 15;
const MAX_ADVANCE_DAYS = 180;
const HOUR = 3600 * 1000;

exports.getSalonAvailability = async (req, res) => {
  try {
    const salonId = Number(req.params.id);
    const { serviceId, date, staffId, excludeBookingId } = req.query;

    if (!serviceId || !date) {
      return res.status(400).json({ error: 'serviceId and date query params are required' });
    }

    const day = parseDateOnly(date);
    if (!day) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });

    const salon = await Salon.findByPk(salonId);
    if (!salon || !salon.isApproved) return res.status(404).json({ error: 'Salon not found' });

    const timezone = isValidTimeZone(salon.timezone) ? salon.timezone : DEFAULT_TIMEZONE;
    // "today" is the salon's today, not the server's
    if (day < dateStringInZone(Date.now(), timezone)) {
      return res.status(400).json({ error: 'Cannot fetch availability for past dates' });
    }

    const service = await SalonService.findOne({ where: { id: Number(serviceId), salon_id: salonId, isActive: true } });
    if (!service) return res.status(404).json({ error: 'Service not found for this salon' });

    // while rescheduling, the customer's own booking must not block its own new slot
    let excludeId;
    if (excludeBookingId && req.user) {
      const own = await Booking.findOne({ where: { id: Number(excludeBookingId), customerId: req.user.id, salonId }, attributes: ['id'] });
      if (own) excludeId = own.id;
    }

    const phases = scheduler.normalizePhases(service);
    const { totalDuration } = scheduler.totals(phases);
    const base = { date, timezone, salonId, serviceId: Number(serviceId), slotDurationMin: totalDuration, phases, slots: [] };

    const window = getDayWindow(salon, day);
    if (!window.enabled || window.open.getTime() > Date.now() + MAX_ADVANCE_DAYS * 24 * HOUR) return res.json(base);

    const staffIds = await loadStaffIds(salonId);
    const bookings = await loadEngineBookings(salonId, window.open, window.close, undefined, excludeId);

    base.slots = scheduler.generateSlots({
      openMs: window.open.getTime(),
      closeMs: window.close.getTime(),
      intervalMin: SLOT_INTERVAL_MIN,
      nowMs: Date.now() + salon.minNoticeHours * HOUR,
      service,
      bookings,
      staffIds,
      seatCount: salon.seats,
      preferredStaffId: staffId !== undefined ? Number(staffId) : undefined,
    });

    res.json(base);
  } catch (error) {
    console.error('Error getting availability:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
};
