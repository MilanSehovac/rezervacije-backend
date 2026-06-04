const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
class SalonService extends Model {}

SalonService.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    serviceKey: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    price: { type: DataTypes.FLOAT, allowNull: false },
    activeDuration: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    passiveDuration: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    requiredStaff: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    requiredSeats: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    canOverlap: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'SalonService',
    tableName: 'salon_services',
    timestamps: true,
  }
);

module.exports = SalonService;