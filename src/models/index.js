const sequelize = require('../config/db');

const User = require('./User');
const Salon = require('./Salon');
const TeamMember = require('./TeamMember');
const SalonService = require('./SalonService');
const Booking = require('./Booking');
const Review = require('./Reviews');
const Favorite = require('./Favorite');
const Notification = require('./Notification');
const BlockedTime = require('./BlockedTime');

Salon.hasMany(SalonService, { as: 'services', foreignKey: 'salon_id' });
SalonService.belongsTo(Salon, { foreignKey: 'salon_id' });
Salon.hasMany(TeamMember, { as: 'teamMembers', foreignKey: 'salon_id' });
TeamMember.belongsTo(Salon, { foreignKey: 'salon_id' });
Salon.hasMany(Booking, { as: 'bookings', foreignKey: 'salonId' });
Booking.belongsTo(Salon, { foreignKey: 'salonId' });
Booking.belongsTo(Salon, { as: 'salon', foreignKey: 'salonId' });
User.hasMany(Booking, { as: 'customerBookings', foreignKey: 'customerId' });
Booking.belongsTo(User, { as: 'customer', foreignKey: 'customerId' });
SalonService.hasMany(Booking, { as: 'bookings', foreignKey: 'serviceId' });
Booking.belongsTo(SalonService, { as: 'service', foreignKey: 'serviceId' });

Salon.hasMany(Review, { as: 'reviews', foreignKey: 'salonId' });
Review.belongsTo(Salon, { foreignKey: 'salonId' });
User.hasMany(Review, { as: 'reviews', foreignKey: 'customerId' });
Review.belongsTo(User, { as: 'customer', foreignKey: 'customerId' });
Booking.hasOne(Review, { as: 'review', foreignKey: 'bookingId' });
Review.belongsTo(Booking, { foreignKey: 'bookingId' });

User.hasMany(Favorite, { as: 'favorites', foreignKey: 'userId' });
Favorite.belongsTo(User, { foreignKey: 'userId' });
Salon.hasMany(Favorite, { as: 'favorites', foreignKey: 'salonId' });
Favorite.belongsTo(Salon, { as: 'salon', foreignKey: 'salonId' });
User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId' });
Notification.belongsTo(User, { foreignKey: 'userId' });

Salon.hasMany(BlockedTime, { as: 'blockedTimes', foreignKey: 'salonId' });
BlockedTime.belongsTo(Salon, { foreignKey: 'salonId' });
TeamMember.hasMany(BlockedTime, { as: 'blockedTimes', foreignKey: 'teamMemberId' });
BlockedTime.belongsTo(TeamMember, { as: 'teamMember', foreignKey: 'teamMemberId' });

module.exports = {
  sequelize,
  User,
  Salon,
  TeamMember,
  SalonService,
  Booking,
  Review,
  Favorite,
  Notification,
  BlockedTime
};