const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Notification extends Model {}

Notification.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'user_id' },
    type: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false },
    bookingId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'booking_id' },
    salonId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'salon_id' },
    readAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'Notification', tableName: 'notifications', timestamps: true }
);

module.exports = Notification;
