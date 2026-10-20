const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { parseJson } = require('../services/scheduler');
const User = require('./User');
const SalonService = require('./SalonService');
const TeamMember = require('./TeamMember');
const Booking = require('./Booking');
class Salon extends Model {}

Salon.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    businessName: { type: DataTypes.STRING(255), allowNull: false },
    category: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    
    email: { type: DataTypes.STRING(100), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    website: { type: DataTypes.STRING(255), allowNull: true },
    instagram: { type: DataTypes.STRING(255), allowNull: true },
    facebook: { type: DataTypes.STRING(255), allowNull: true },
    twitter: { type: DataTypes.STRING(255), allowNull: true },

    address: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    zipCode: { type: DataTypes.STRING(20), allowNull: true },

    priceRange: { type: DataTypes.STRING(10), allowNull: true },
    specialties: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJson(this.getDataValue('specialties'), []);
      },
    },
    cancellationPolicy: { type: DataTypes.TEXT, allowNull: true },

    images: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJson(this.getDataValue('images'), []);
      },
    },
    daysOfOperation: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJson(this.getDataValue('daysOfOperation'), {});
      },
    },
    // Chairs/stations available at the same time. null = unlimited.
    seats: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    autoConfirm: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    minNoticeHours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    cancellationHours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    // IANA zone the opening hours are expressed in
    timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Europe/Sarajevo' },

    isApproved: { type: DataTypes.BOOLEAN, defaultValue: false },
    userId: { 
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'user_id'
    },
  },
  {
    sequelize,
    modelName: 'Salon',
    tableName: 'salons',
    timestamps: true,
  }
);

Salon.belongsTo(User, {as: 'owner', foreignKey:'userId'} );
User.hasOne(Salon, {as: 'salon', foreignKey:'userId'});

module.exports = Salon;