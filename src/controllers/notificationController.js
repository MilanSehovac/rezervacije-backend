const { Notification } = require('../models');

// GET /notifications -> { unreadCount, notifications: latest 50 }
exports.list = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 50 }),
      Notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    res.json({ unreadCount, notifications });
  } catch (error) {
    console.error('Error listing notifications:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
};

// PATCH /notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const n = await Notification.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return res.status(404).json({ error: 'Notification not found' });
    if (!n.readAt) await n.update({ readAt: new Date() });
    res.json(n);
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
};

// POST /notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
    res.json({ unreadCount: 0 });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
};
