const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Review extends Model {}

Review.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    salonId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'salon_id' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'customer_id' },
    bookingId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true, field: 'booking_id' },
    rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: 'Review', tableName: 'reviews', timestamps: true }
);

module.exports = Review;
