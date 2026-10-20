const { Salon, User, SalonService } = require('../models');

// GET /admin/salons?status=pending|approved|all
exports.listSalons = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const where = status === 'all' ? {} : { isApproved: status === 'approved' };
    const salons = await Salon.findAll({
      where,
      include: [
        { model: User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
        { model: SalonService, as: 'services', required: false },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(salons);
  } catch (error) {
    console.error('Error listing salons for admin:', error);
    res.status(500).json({ error: 'Failed to list salons' });
  }
};

// PATCH /admin/salons/:id  { isApproved: boolean }
exports.setApproval = async (req, res) => {
  try {
    if (typeof req.body.isApproved !== 'boolean') {
      return res.status(400).json({ error: 'isApproved must be true or false' });
    }
    const salon = await Salon.findByPk(req.params.id);
    if (!salon) return res.status(404).json({ error: 'Salon not found' });
    await salon.update({ isApproved: req.body.isApproved });
    res.json(salon);
  } catch (error) {
    console.error('Error updating approval:', error);
    res.status(500).json({ error: 'Failed to update salon' });
  }
};
