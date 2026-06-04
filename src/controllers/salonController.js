const { Salon, TeamMember, SalonService, User } = require('../models');

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

    const { teamMembers, services, specialties, ...salonData } = req.body;

    const formattedSpecialties = specialties?.length ? specialties : null;

    const salon = await Salon.create({
      ...salonData,
      specialties: formattedSpecialties,
      userId: req.user.id
    });

    if (services?.length) {
      const salonServices = services.map(s => ({
        ...s,
        salon_id: salon.id,
      }));
      await SalonService.bulkCreate(salonServices);
    }

    if (teamMembers?.length) {
      const members = teamMembers.map(m => ({ ...m, salonId: salon.id }));
      await TeamMember.bulkCreate(members);
    }

    const createdSalon = await Salon.findByPk(salon.id, {
      include: [
        { model: SalonService, as: 'services' },
        { model: TeamMember, as: 'teamMembers' }
      ]
    });

    res.status(201).json(createdSalon);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create salon' });
  }
};

exports.getSalon = async (req, res) => {
  try {
    const salons = await Salon.findAll({
      include: [
        { model: SalonService, as: 'services' },
        { model: TeamMember, as: 'teamMembers' },
        { model: User, attributes: ['id', 'firstName', 'lastName', 'email'] }
      ]
    });

    res.json(salons);
  } catch (error) {
    console.error('Error getting salons:', error);
    res.status(500).json({ error: 'Failed to get salons' });
  }
};

exports.getSalonById = async (req, res) => {
  const { id } = req.params;

  try {
    const salon = await Salon.findByPk(id, {
      include: [
        { model: SalonService, as: 'services' },
        { model: TeamMember, as: 'teamMembers' },
        { model: User, attributes: ['id', 'firstName', 'lastName', 'email'], as: 'owner' }
      ]
    });

    if (!salon) {
      return res.status(404).json({ error: 'Salon not found' });
    }

    res.json(salon);
  } catch (error) {
    console.error('Error getting salon by ID:', error);
    res.status(500).json({ error: 'Failed to get salon' });
  }
};

exports.getAllSalons = async (req, res) => {
  try {
    const salons = await Salon.findAll({
      where: { isApproved: 1 },
      include: [{ model: SalonService, as: 'services' }]
    });

    res.json(salons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get salons' });
  }
};