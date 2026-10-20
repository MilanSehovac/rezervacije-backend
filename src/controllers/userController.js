const User = require('../models/User')
const { Salon, Booking } = require('../models')
const { Op } = require('sequelize')
const { events, loadForNotification } = require('../services/notifications')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

exports.getUser = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'userType']
    });
    res.json(users);
  } catch (error) {
    console.error('Could not get users:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
exports.createUser = async (req, res) => {
  try {
    const { firstName, lastName, password, phoneNumber, userType } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!firstName || !lastName || !email || !phoneNumber) {
      return res.status(400).json({ error: 'firstName, lastName, email and phoneNumber are required' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be between 8 and 72 characters' });
    }
    // Only these two roles can self-register
    if (!['user', 'salon_owner'].includes(userType)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({ firstName, lastName, email, password, phoneNumber, userType });

    res.status(201).json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });

  } catch (err) {
    if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid data' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.userLogin = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { password } = req.body;
    if (!email || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'state', 'city', 'address', 'zipcode', 'userType', 'createdAt', 'notificationPrefs'],
      include: [{ model: Salon, as: 'salon' }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user,
      salon: user.salon || null
    });

  } catch (err) {
    console.error('Error in getMe:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /users/me/notifications  { reminders?: boolean, statusUpdates?: boolean }
exports.updateNotificationPrefs = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const next = { ...user.notificationPrefs };
    for (const key of ['reminders', 'statusUpdates']) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== 'boolean') return res.status(400).json({ error: `${key} must be true or false` });
        next[key] = req.body[key];
      }
    }
    await user.update({ notificationPrefs: next });
    res.json({ notificationPrefs: user.notificationPrefs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

// POST /users/me/password  { currentPassword, newPassword }
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ error: 'New password must be between 8 and 72 characters' });
    }
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    await user.update({ password: newPassword }); // hashed by the model hook
    res.json({ message: 'Password changed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// DELETE /users/me  { password }  -> soft delete; upcoming bookings are cancelled, a salon is unpublished
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (typeof req.body.password !== 'string' || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    const open = ['pending', 'confirmed'];
    const salon = await Salon.findOne({ where: { userId: user.id } });

    // customer side: free the slots the user was holding
    await Booking.update({ status: 'cancelled' }, { where: { customerId: user.id, status: open, endAt: { [Op.gt]: new Date() } } });

    if (salon) {
      const upcoming = await Booking.findAll({ where: { salonId: salon.id, status: open, endAt: { [Op.gt]: new Date() } }, attributes: ['id', 'status'] });
      await salon.update({ isApproved: false });
      await Booking.update({ status: 'cancelled' }, { where: { id: upcoming.map((b) => b.id) } });
      // tell the customers (best effort)
      upcoming.forEach((b) => loadForNotification(b.id).then((full) => full && events.declinedBySalon(full, b.status)).catch(() => {}));
    }

    await user.update({ is_deleted: true });
    res.clearCookie('refreshToken');
    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

exports.logout = async (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
};

exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id)

    if (!user){
      return res.status(404).json({ error: 'User not found' })
    }

    // Whitelist: never let the client touch password, userType or is_deleted here
    const fields = ['firstName', 'lastName', 'email', 'phoneNumber', 'address', 'city', 'state', 'zipcode']
    const updates = {}
    for (const field of fields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]
    }
    if (updates.email !== undefined) {
      updates.email = String(updates.email).trim().toLowerCase()
      const taken = await User.findOne({ where: { email: updates.email } })
      if (taken && taken.id !== user.id) {
        return res.status(409).json({ error: 'Email already in use' })
      }
    }

    await user.update(updates)

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        city: user.city,
        state: user.state,
        zipcode: user.zipcode,
        userType: user.userType,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });

  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: error.errors?.[0]?.message || 'Invalid data' })
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating user profile' });
  }
}
