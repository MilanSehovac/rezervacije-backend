const { Favorite, Salon, SalonService } = require('../models');
const { ratingSummaries } = require('./reviewController');
const { priceInfo } = require('../services/pricing');

// GET /favorites -> approved salons the user saved, newest first
exports.list = async (req, res) => {
  try {
    const favorites = await Favorite.findAll({
      where: { userId: req.user.id },
      include: [{
        model: Salon, as: 'salon', where: { isApproved: true },
        include: [{ model: SalonService, as: 'services', where: { isActive: true }, required: false }],
      }],
      order: [['createdAt', 'DESC']],
    });
    const salons = favorites.map((f) => f.salon);
    const summaries = await ratingSummaries(salons.map((s) => s.id));
    res.json(salons.map((s) => {
      const plain = s.toJSON();
      return { ...plain, ...priceInfo(plain.services), ...(summaries[s.id] || { rating: null, reviewCount: 0 }) };
    }));
  } catch (error) {
    console.error('Error listing favorites:', error);
    res.status(500).json({ error: 'Failed to load favorites' });
  }
};

// GET /favorites/ids -> [salonId, ...]
exports.ids = async (req, res) => {
  try {
    const rows = await Favorite.findAll({ where: { userId: req.user.id }, attributes: ['salonId'] });
    res.json(rows.map((r) => r.salonId));
  } catch (error) {
    console.error('Error listing favorite ids:', error);
    res.status(500).json({ error: 'Failed to load favorites' });
  }
};

// PUT /favorites/:salonId (idempotent)
exports.add = async (req, res) => {
  try {
    const salon = await Salon.findByPk(req.params.salonId, { attributes: ['id', 'isApproved'] });
    if (!salon || !salon.isApproved) return res.status(404).json({ error: 'Salon not found' });
    await Favorite.findOrCreate({ where: { userId: req.user.id, salonId: salon.id } });
    res.json({ salonId: salon.id, favorite: true });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to save favorite' });
  }
};

// DELETE /favorites/:salonId (idempotent)
exports.remove = async (req, res) => {
  try {
    await Favorite.destroy({ where: { userId: req.user.id, salonId: Number(req.params.salonId) } });
    res.json({ salonId: Number(req.params.salonId), favorite: false });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
};
