const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

class User extends Model {
  async comparePassword(plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { is: /^\+?\d{10,15}$/ },
    },
    userType: {
      type: DataTypes.ENUM('user', 'salon_owner', 'admin'),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    zipcode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    notificationPrefs: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'notification_prefs',
      get() {
        const raw = this.getDataValue('notificationPrefs');
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { reminders: true, statusUpdates: true, ...(parsed || {}) };
      },
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    defaultScope:{
      where: {
        is_deleted: false,
      }
    },
    scopes: {
      deleted: {where:{is_deleted:true}},
      all: {where: {}},
    },
    hooks: {
      beforeCreate: async (user) => {
        user.password = await bcrypt.hash(user.password, SALT_ROUNDS);
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, SALT_ROUNDS);
        }
      },
    },
  }
);
module.exports = User;