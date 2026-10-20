'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- salon booking rules
    // instant confirmation instead of waiting for the owner
    await queryInterface.addColumn('salons', 'autoConfirm', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    // customers cannot book closer to the start than this
    await queryInterface.addColumn('salons', 'minNoticeHours', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
    // customers cannot cancel / reschedule closer to the start than this (0 = any time)
    await queryInterface.addColumn('salons', 'cancellationHours', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });

    // ---- walk-in / phone bookings entered by the owner have no customer account
    await queryInterface.changeColumn('bookings', 'customer_id', { type: Sequelize.INTEGER.UNSIGNED, allowNull: true });
    await queryInterface.addColumn('bookings', 'guestName', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn('bookings', 'guestPhone', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('bookings', 'source', {
      type: Sequelize.ENUM('online', 'manual'),
      allowNull: false,
      defaultValue: 'online',
    });

    // ---- blocked time: lunch, day off, vacation. Blocks one staff member or the whole salon.
    await queryInterface.createTable('blocked_times', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      salon_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'salons', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // null = everybody
      team_member_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'team_members', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      start_at: { type: Sequelize.DATE, allowNull: false },
      end_at: { type: Sequelize.DATE, allowNull: false },
      reason: { type: Sequelize.STRING(150), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('blocked_times', ['salon_id', 'start_at'], { name: 'blocked_salon_start_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blocked_times');
    await queryInterface.removeColumn('bookings', 'source');
    await queryInterface.removeColumn('bookings', 'guestPhone');
    await queryInterface.removeColumn('bookings', 'guestName');
    await queryInterface.sequelize.query('DELETE FROM bookings WHERE customer_id IS NULL');
    await queryInterface.changeColumn('bookings', 'customer_id', { type: queryInterface.sequelize.constructor.INTEGER.UNSIGNED, allowNull: false });
    await queryInterface.removeColumn('salons', 'cancellationHours');
    await queryInterface.removeColumn('salons', 'minNoticeHours');
    await queryInterface.removeColumn('salons', 'autoConfirm');
  },
};
