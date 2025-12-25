const sequelize = require('../config/db');

const User = require('./User');
const Salon = require('./Salon');

User.hasMany(Salon, {
    foreignKey: {
      name: 'user_id',
      allowNull: true,
    },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  
  Salon.belongsTo(User, {
    foreignKey: {
      name: 'user_id',
      allowNull: true,
    },
  });

module.exports = {
  sequelize,
  User,
  Salon,
};