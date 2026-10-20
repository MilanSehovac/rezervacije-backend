const { Op } = require('sequelize');
const { BlockedTime, TeamMember, Booking, sequelize } = require('../models');
const scheduler = require('../services/scheduler');
const { INACTIVE_STATUSES } = require('../services/loaders');

const MAX_SPAN_DAYS = 366;

// GET /salon/me/blocked -> blocked periods that have not ended yet
exports.list = async (req, res) => {
  try {
    const blocks = await BlockedTime.findAll({
      where: { salonId: req.salon.id, endAt: { [Op.gt]: new Date() } },
      order: [['startAt', 'ASC']],
    });
    res.json(blocks);
  } catch (error) {
    console.error('Error listing blocked time:', error);
    res.status(500).json({ error: 'Failed to load blocked time' });
  }
};

// POST /salon/me/blocked { startAt, endAt, teamMemberId?, reason? }
exports.create = async (req, res) => {
  try {
    const start = new Date(req.body.startAt);
    const end = new Date(req.body.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid start or end time' });
    if (end <= start) return res.status(400).json({ error: 'End must be after start' });
    if (end.getTime() - start.getTime() > MAX_SPAN_DAYS * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'A blocked period can be at most a year long' });
    }
    if (end <= new Date()) return res.status(400).json({ error: 'That period is already over' });

    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 150) : '';
    let teamMemberId = null;
    if (req.body.teamMemberId !== undefined && req.body.teamMemberId !== null && req.body.teamMemberId !== '') {
      const member = await TeamMember.findOne({ where: { id: Number(req.body.teamMemberId), salon_id: req.salon.id } });
      if (!member) return res.status(404).json({ error: 'Team member not found' });
      teamMemberId = member.id;
    }

    const block = await sequelize.transaction(async (transaction) => {
      // appointments already in that window must be moved or cancelled first
      const bookings = await Booking.findAll({
        where: {
          salonId: req.salon.id,
          status: { [Op.notIn]: INACTIVE_STATUSES },
          startAt: { [Op.lt]: end },
          endAt: { [Op.gt]: start },
        },
        attributes: ['startAt', 'endAt', 'schedule'],
        transaction,
      });
      const clashes = bookings
        .map(scheduler.hydrateBooking)
        .filter((b) => scheduler.bookingTouchesWindow(b, teamMemberId, start.getTime(), end.getTime()));
      if (clashes.length) {
        const error = new Error(`${clashes.length} booking(s) already fall into this time. Cancel or finish them first.`);
        error.status = 409;
        throw error;
      }
      return BlockedTime.create({ salonId: req.salon.id, teamMemberId, startAt: start, endAt: end, reason: reason || null }, { transaction });
    });
    res.status(201).json(block);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error creating blocked time:', error);
    res.status(500).json({ error: 'Failed to block time' });
  }
};

// DELETE /salon/me/blocked/:id
exports.remove = async (req, res) => {
  try {
    const block = await BlockedTime.findOne({ where: { id: req.params.id, salonId: req.salon.id } });
    if (!block) return res.status(404).json({ error: 'Blocked time not found' });
    await block.destroy();
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error removing blocked time:', error);
    res.status(500).json({ error: 'Failed to remove blocked time' });
  }
};
