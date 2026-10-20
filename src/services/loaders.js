'use strict';

const { Op } = require('sequelize');
const { Booking, BlockedTime, TeamMember } = require('../models');
const scheduler = require('./scheduler');

// Cancelled / no-show bookings free their time
const INACTIVE_STATUSES = ['cancelled', 'no_show'];

/**
 * Everything that occupies staff in [from, to): active bookings plus blocked time (breaks, days off),
 * in engine shape. `excludeBookingId` lets a booking be moved without colliding with itself.
 */
async function loadEngineBookings(salonId, from, to, transaction, excludeBookingId) {
  const bookingWhere = {
    salonId,
    status: { [Op.notIn]: INACTIVE_STATUSES },
    startAt: { [Op.lt]: to },
    endAt: { [Op.gt]: from },
  };
  if (excludeBookingId) bookingWhere.id = { [Op.ne]: excludeBookingId };

  const [rows, blocks] = await Promise.all([
    Booking.findAll({ where: bookingWhere, attributes: ['startAt', 'endAt', 'schedule'], transaction }),
    BlockedTime.findAll({
      where: { salonId, startAt: { [Op.lt]: to }, endAt: { [Op.gt]: from } },
      attributes: ['startAt', 'endAt', 'teamMemberId'],
      transaction,
    }),
  ]);

  const hydrated = rows.map(scheduler.hydrateBooking);
  for (const b of blocks) {
    const start = new Date(b.startAt).getTime();
    const end = new Date(b.endAt).getTime();
    hydrated.push({
      start,
      end,
      intervals: [{ type: 'active', start, end }],
      canOverlap: false,
      // null = whole salon; no team members exist -> the implicit staff member (id 0) is covered as well
      staffIds: b.teamMemberId ? [b.teamMemberId] : null,
      seats: 0,
    });
  }
  return hydrated;
}

async function loadStaffIds(salonId, transaction) {
  const members = await TeamMember.findAll({ where: { salon_id: salonId }, attributes: ['id'], order: [['id', 'ASC']], transaction });
  return members.map((m) => m.id);
}

module.exports = { INACTIVE_STATUSES, loadEngineBookings, loadStaffIds };
