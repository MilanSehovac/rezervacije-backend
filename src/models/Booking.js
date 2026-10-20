const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { parseJson } = require('../services/scheduler');
class Booking extends Model {}

Booking.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    salonId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'salon_id',
    },
    customerId: {
      // null for bookings the salon entered by hand (walk-ins, phone calls)
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
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
    guestName: { type: DataTypes.STRING(100), allowNull: true },
    guestPhone: { type: DataTypes.STRING(30), allowNull: true },
    source: { type: DataTypes.ENUM('online', 'manual'), allowNull: false, defaultValue: 'online' },
    // { phases, canOverlap, requiredSeats, staffIds } snapshot taken when the booking was made
    schedule: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJson(this.getDataValue('schedule'), null);
      },
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
