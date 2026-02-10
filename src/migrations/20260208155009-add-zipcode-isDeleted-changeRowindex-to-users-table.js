'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    // Reorder existing columns
    await queryInterface.changeColumn('users', 'address', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'email'
    });

    await queryInterface.changeColumn('users', 'city', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'address'
    });

    await queryInterface.changeColumn('users', 'state', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'city'
    });

    // Add new columns
    await queryInterface.addColumn('users', 'zipcode', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'state'
    });

    await queryInterface.addColumn('users', 'is_deleted', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      after: 'zipcode'
    });
  },

  async down(queryInterface, Sequelize) {

    await queryInterface.removeColumn('users', 'zipcode');
    await queryInterface.removeColumn('users', 'is_deleted');

    // Optional: revert column order (not really needed)
    await queryInterface.changeColumn('users', 'address', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.changeColumn('users', 'city', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.changeColumn('users', 'state', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
  }
};