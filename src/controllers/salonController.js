const { Op } = require('sequelize');
const { Salon, TeamMember, SalonService, User, Booking, sequelize } = require('../models');
const { validateSalon, validateService, validateTeamMember } = require('../services/validation');
const { INACTIVE_STATUSES } = require('../services/loaders');
const scheduler = require('../services/scheduler');
const { ratingSummaries } = require('./reviewController');
const { priceInfo } = require('../services/pricing');
const { UPLOAD_DIR } = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

const MAX_IMAGES = 10;

/** Adds rating / reviewCount to plain salon objects. */
async function withRatings(salons) {
  const list = Array.isArray(salons) ? salons : [salons];
  const summaries = await ratingSummaries(list.map((s) => s.id));
  const out = list.map((s) => {
    const plain = s.toJSON();
    // the price level is derived from the services, not typed in by the owner
    return { ...plain, ...priceInfo(plain.services), ...(summaries[s.id] || { rating: null, reviewCount: 0 }) };
  });
  return Array.isArray(salons) ? out : out[0];
}

const MAX_SERVICES = 60;
const MAX_TEAM = 50;

// New salons wait for admin approval unless the deployment opts out (there is no admin UI yet).
const autoApprove = () => String(process.env.AUTO_APPROVE_SALONS).toLowerCase() === 'true';

const activeServices = { model: SalonService, as: 'services', where: { isActive: true }, required: false };
const allServices = { model: SalonService, as: 'services', required: false };
const team = { model: TeamMember, as: 'teamMembers', required: false };

exports.createSalon = async (req, res) => {
  try {
    const owner = await User.findByPk(req.user.id, { attributes: ['id', 'userType'] });
    if (!owner || owner.userType !== 'salon_owner') {
      return res.status(403).json({ error: 'Only salon owners can create a salon' });
    }

    const existingSalon = await Salon.findOne({ where: { userId: req.user.id } });
    if (existingSalon) {
      return res.status(409).json({ error: 'You already have a salon listed' });
    }

    const salonCheck = validateSalon(req.body);
    if (!salonCheck.ok) return res.status(400).json({ error: salonCheck.error });

    const { services, teamMembers } = req.body;
    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ error: 'Add at least one service' });
    }
    if (services.length > MAX_SERVICES || (teamMembers || []).length > MAX_TEAM) {
      return res.status(400).json({ error: 'Too many services or team members' });
    }

    const serviceRows = [];
    for (const s of services) {
      const check = validateService(s);
      if (!check.ok) return res.status(400).json({ error: `${s && s.name ? s.name + ': ' : ''}${check.error}` });
      serviceRows.push(check.value);
    }

    const memberRows = [];
    for (const m of teamMembers || []) {
      const check = validateTeamMember(m);
      if (!check.ok) return res.status(400).json({ error: check.error });
      memberRows.push(check.value);
    }

    const salon = await sequelize.transaction(async (transaction) => {
      const created = await Salon.create(
        { ...salonCheck.value, isApproved: autoApprove(), userId: req.user.id },
        { transaction }
      );
      await SalonService.bulkCreate(serviceRows.map((s) => ({ ...s, salon_id: created.id })), { transaction });
      if (memberRows.length) {
        await TeamMember.bulkCreate(memberRows.map((m) => ({ ...m, salon_id: created.id })), { transaction });
      }
      return created;
    });

    const createdSalon = await Salon.findByPk(salon.id, { include: [allServices, team] });
    res.status(201).json(createdSalon);
  } catch (error) {
    console.error('Error creating salon:', error);
    res.status(500).json({ error: 'Failed to create salon' });
  }
};

exports.getAllSalons = async (req, res) => {
  try {
    const salons = await Salon.findAll({ where: { isApproved: true }, include: [activeServices] });
    res.json(await withRatings(salons));
  } catch (error) {
    console.error('Error getting salons:', error);
    res.status(500).json({ error: 'Failed to get salons' });
  }
};

exports.getSalonById = async (req, res) => {
  try {
    const salon = await Salon.findByPk(req.params.id, {
      include: [
        activeServices,
        team,
        { model: User, attributes: ['id', 'firstName', 'lastName'], as: 'owner' },
      ],
    });

    // Unapproved salons are visible to their owner only
    const isOwner = req.user && salon && salon.userId === req.user.id;
    if (!salon || (!salon.isApproved && !isOwner)) {
      return res.status(404).json({ error: 'Salon not found' });
    }

    res.json(await withRatings(salon));
  } catch (error) {
    console.error('Error getting salon by ID:', error);
    res.status(500).json({ error: 'Failed to get salon' });
  }
};

// ----- Owner management (req.salon is set by salonOwnerOnly) -----

exports.getMySalon = async (req, res) => {
  try {
    const salon = await Salon.findByPk(req.salon.id, { include: [allServices, team] });
    res.json(salon);
  } catch (error) {
    console.error('Error getting own salon:', error);
    res.status(500).json({ error: 'Failed to get salon' });
  }
};

exports.updateMySalon = async (req, res) => {
  try {
    const check = validateSalon(req.body, { partial: true });
    if (!check.ok) return res.status(400).json({ error: check.error });
    await req.salon.update(check.value);
    res.json(req.salon);
  } catch (error) {
    console.error('Error updating salon:', error);
    res.status(500).json({ error: 'Failed to update salon' });
  }
};

exports.addService = async (req, res) => {
  try {
    const count = await SalonService.count({ where: { salon_id: req.salon.id, isActive: true } });
    if (count >= MAX_SERVICES) return res.status(400).json({ error: 'Service limit reached' });

    const check = validateService(req.body);
    if (!check.ok) return res.status(400).json({ error: check.error });

    const service = await SalonService.create({ ...check.value, salon_id: req.salon.id });
    res.status(201).json(service);
  } catch (error) {
    console.error('Error adding service:', error);
    res.status(500).json({ error: 'Failed to add service' });
  }
};

exports.updateService = async (req, res) => {
  try {
    const service = await SalonService.findOne({ where: { id: req.params.serviceId, salon_id: req.salon.id } });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const check = validateService(req.body, { partial: true });
    if (!check.ok) return res.status(400).json({ error: check.error });

    // Existing bookings keep their own phase snapshot, so edits only affect future bookings.
    await service.update(check.value);
    res.json(service);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const service = await SalonService.findOne({ where: { id: req.params.serviceId, salon_id: req.salon.id } });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const used = await Booking.count({ where: { serviceId: service.id } });
    if (used > 0) {
      // keep history intact, just stop offering it
      await service.update({ isActive: false });
      return res.json({ archived: true });
    }
    await service.destroy();
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
};

exports.addTeamMember = async (req, res) => {
  try {
    const count = await TeamMember.count({ where: { salon_id: req.salon.id } });
    if (count >= MAX_TEAM) return res.status(400).json({ error: 'Team member limit reached' });

    const check = validateTeamMember(req.body);
    if (!check.ok) return res.status(400).json({ error: check.error });

    const member = await TeamMember.create({ ...check.value, salon_id: req.salon.id });
    res.status(201).json(member);
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
};

exports.updateTeamMember = async (req, res) => {
  try {
    const member = await TeamMember.findOne({ where: { id: req.params.memberId, salon_id: req.salon.id } });
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    const check = validateTeamMember(req.body, { partial: true });
    if (!check.ok) return res.status(400).json({ error: check.error });

    await member.update(check.value);
    res.json(member);
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
};

exports.deleteTeamMember = async (req, res) => {
  try {
    const member = await TeamMember.findOne({ where: { id: req.params.memberId, salon_id: req.salon.id } });
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    // Removing a staff member would silently free their upcoming appointments for other customers.
    const upcoming = await Booking.findAll({
      where: {
        salonId: req.salon.id,
        status: { [Op.notIn]: [...INACTIVE_STATUSES, 'completed'] },
        endAt: { [Op.gt]: new Date() },
      },
      attributes: ['schedule'],
    });
    const hasUpcoming = upcoming.some((b) => {
      const ids = scheduler.parseJson(b.schedule, null)?.staffIds;
      return Array.isArray(ids) && ids.includes(member.id);
    });
    if (hasUpcoming) {
      return res.status(409).json({ error: 'This team member has upcoming bookings. Cancel or finish them first.' });
    }

    await member.destroy();
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
};

// ----- images -----

exports.uploadImages = async (req, res) => {
  const files = req.files || [];
  try {
    const current = req.salon.images || [];
    if (current.length + files.length > MAX_IMAGES) {
      files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(400).json({ error: `A salon can have at most ${MAX_IMAGES} images` });
    }
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const urls = files.map((f) => `${base}/uploads/salons/${f.filename}`);
    await req.salon.update({ images: [...current, ...urls] });
    res.status(201).json({ images: req.salon.images });
  } catch (error) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    console.error('Error uploading images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const { url } = req.body;
    const current = req.salon.images || [];
    if (typeof url !== 'string' || !current.includes(url)) return res.status(404).json({ error: 'Image not found' });
    await req.salon.update({ images: current.filter((i) => i !== url) });
    const file = path.join(UPLOAD_DIR, path.basename(new URL(url).pathname));
    if (file.startsWith(UPLOAD_DIR)) fs.unlink(file, () => {});
    res.json({ images: req.salon.images });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
};
