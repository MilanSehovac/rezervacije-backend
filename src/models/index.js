const sequelize = require('../config/db');

const User = require('./User');
const Salon = require('./Salon');
const TeamMember = require('./TeamMember');
const SalonService = require('./SalonService');
const Booking = require('./Booking');

Salon.hasMany(SalonService, { as: 'services', foreignKey: 'salon_id' });
SalonService.belongsTo(Salon, { foreignKey: 'salon_id' });
Salon.hasMany(TeamMember, { as: 'teamMembers', foreignKey: 'salon_id' });
TeamMember.belongsTo(Salon, { foreignKey: 'salon_id' });
Salon.hasMany(Booking, { as: 'bookings', foreignKey: 'salon_id' });
Booking.belongsTo(Salon, { foreignKey: 'salon_Id' });
User.hasMany(Booking, { as: 'customerBookings', foreignKey: 'customerId' });
Booking.belongsTo(User, { as: 'customer', foreignKey: 'customerId' });
SalonService.hasMany(Booking, { as: 'bookings', foreignKey: 'serviceId' });
Booking.belongsTo(SalonService, { as: 'service', foreignKey: 'serviceId' });

module.exports = {
  sequelize,
  User,
  Salon,
  TeamMember,
  SalonService,
  Booking
};