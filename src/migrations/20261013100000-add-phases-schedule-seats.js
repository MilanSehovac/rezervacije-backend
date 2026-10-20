'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Ordered active/passive phases per service, e.g. [{type:'active',duration:30},{type:'passive',duration:60},{type:'active',duration:30}]
    await queryInterface.addColumn('salon_services', 'phases', { type: Sequelize.JSON, allowNull: true });
    // Archived services stay in old bookings but are hidden from customers
    await queryInterface.addColumn('salon_services', 'isActive', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    // Snapshot of phases / staff / seats used by the booking, so later service edits never move old bookings
    await queryInterface.addColumn('bookings', 'schedule', { type: Sequelize.JSON, allowNull: true });

    // null = unlimited seats (passive customers can all wait at once)
    await queryInterface.addColumn('salons', 'seats', { type: Sequelize.INTEGER.UNSIGNED, allowNull: true });
    // image URLs as JSON text; varchar(255) truncated anything beyond one or two URLs
    await queryInterface.changeColumn('salons', 'images', { type: Sequelize.TEXT, allowNull: true });

    await queryInterface.addIndex('bookings', ['salon_id', 'start_at'], { name: 'bookings_salon_start_idx' });
    await queryInterface.addIndex('bookings', ['customer_id'], { name: 'bookings_customer_idx' });
    await queryInterface.addConstraint('bookings', {
      fields: ['service_id'],
      type: 'foreign key',
      name: 'bookings_service_fk',
      references: { table: 'salon_services', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('bookings', 'bookings_service_fk');
    await queryInterface.removeIndex('bookings', 'bookings_customer_idx');
    await queryInterface.removeIndex('bookings', 'bookings_salon_start_idx');
    await queryInterface.changeColumn('salons', 'images', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.removeColumn('salons', 'seats');
    await queryInterface.removeColumn('bookings', 'schedule');
    await queryInterface.removeColumn('salon_services', 'isActive');
    await queryInterface.removeColumn('salon_services', 'phases');
  },
};
