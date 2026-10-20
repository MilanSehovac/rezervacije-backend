'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ref = (table) => ({
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: table, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    await queryInterface.createTable('favorites', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: ref('users'),
      salon_id: ref('salons'),
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addConstraint('favorites', { fields: ['user_id', 'salon_id'], type: 'unique', name: 'favorites_user_salon_uq' });

    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: ref('users'),
      type: { type: Sequelize.STRING(40), allowNull: false },
      title: { type: Sequelize.STRING(150), allowNull: false },
      message: { type: Sequelize.STRING(500), allowNull: false },
      booking_id: { ...ref('bookings'), allowNull: true },
      salon_id: { ...ref('salons'), allowNull: true },
      readAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addIndex('notifications', ['user_id', 'readAt', 'createdAt'], { name: 'notifications_user_idx' });
    // one reminder / status message of each type per booking and user
    await queryInterface.addConstraint('notifications', {
      fields: ['user_id', 'booking_id', 'type'],
      type: 'unique',
      name: 'notifications_booking_type_uq',
    });

    // { reminders: boolean, statusUpdates: boolean }; null means everything on
    await queryInterface.addColumn('users', 'notification_prefs', { type: Sequelize.JSON, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'notification_prefs');
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('favorites');
  },
};
