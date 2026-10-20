const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class BlockedTime extends Model {}

BlockedTime.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    salonId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'salon_id' },
    // null = the whole salon
    teamMemberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'team_member_id' },
    startAt: { type: DataTypes.DATE, allowNull: false, field: 'start_at' },
    endAt: { type: DataTypes.DATE, allowNull: false, field: 'end_at' },
    reason: { type: DataTypes.STRING(150), allowNull: true },
  },
  { sequelize, modelName: 'BlockedTime', tableName: 'blocked_times', timestamps: true }
);

module.exports = BlockedTime;
