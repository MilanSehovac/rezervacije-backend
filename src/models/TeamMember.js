const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class TeamMember extends Model {}

TeamMember.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    role: { type: DataTypes.STRING(50), allowNull: false },
    specialties: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    sequelize,
    modelName: 'TeamMember',
    tableName: 'team_members',
    timestamps: true,
  }
);
;
module.exports = TeamMember;