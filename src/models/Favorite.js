const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Favorite extends Model {}

Favorite.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
    salonId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'salon_id' },
  },
  { sequelize, modelName: 'Favorite', tableName: 'favorites', timestamps: true }
);

module.exports = Favorite;
