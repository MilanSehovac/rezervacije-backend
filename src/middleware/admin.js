const { User } = require('../models');

exports.adminOnly = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'userType'] });
    if (!user || user.userType !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
