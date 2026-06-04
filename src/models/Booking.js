const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
class Booking extends Model {}

Booking.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    salonId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'salon_id',
    },
    customerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'customer_id',
    },
    serviceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'service_id',
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show'),
      allowNull: false,
      defaultValue: 'pending',
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_at',
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_at',
    },
    totalPrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'total_price',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Booking',
    tableName: 'bookings',
    timestamps: true,
  }
);

module.exports = Booking;
