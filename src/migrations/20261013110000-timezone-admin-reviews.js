'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('salons', 'timezone', {
      type: Sequelize.STRING(64),
      allowNull: false,
      defaultValue: 'Europe/Sarajevo',
    });
    await queryInterface.changeColumn('users', 'userType', {
      type: Sequelize.ENUM('user', 'salon_owner', 'admin'),
      allowNull: false,
    });

    await queryInterface.createTable('reviews', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      salon_id: {
        type: Sequelize.INTEGER.UNSIGNED, allowNull: false,
        references: { model: 'salons', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      customer_id: {
        type: Sequelize.INTEGER.UNSIGNED, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      // one review per finished booking
      booking_id: {
        type: Sequelize.INTEGER.UNSIGNED, allowNull: false, unique: true,
        references: { model: 'bookings', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      rating: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false },
      comment: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('reviews', ['salon_id'], { name: 'reviews_salon_idx' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('reviews');
    await queryInterface.changeColumn('users', 'userType', {
      type: Sequelize.ENUM('user', 'salon_owner'),
      allowNull: false,
    });
    await queryInterface.removeColumn('salons', 'timezone');
  },
};
