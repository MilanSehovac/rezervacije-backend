const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { parseJson } = require('../services/scheduler');
class SalonService extends Model {}

SalonService.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    // preset key such as 'hair_coloring'; empty for services the owner created himself
    serviceKey: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '',
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    price: { type: DataTypes.FLOAT, allowNull: false },
    activeDuration: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    passiveDuration: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    requiredStaff: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    requiredSeats: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    canOverlap: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Ordered [{type:'active'|'passive', duration}] list. null -> derived from activeDuration/passiveDuration
    phases: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJson(this.getDataValue('phases'), null);
      },
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'SalonService',
    tableName: 'salon_services',
    timestamps: true,
  }
);

module.exports = SalonService;