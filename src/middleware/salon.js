const { Salon } = require('../models')

exports.salonOwnerOnly = async (req, res, next) => {
    try {
      const salon = await Salon.findOne({ where: { userId: req.user.id } });
      if (!salon) return res.status(403).json({ error: 'No salon found' });
      req.salon = salon;
      next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
};