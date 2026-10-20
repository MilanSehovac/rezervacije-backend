'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('salons', 'email', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'website', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'instagram', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'facebook', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'twitter', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'zipCode', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'daysOfOperation', { type: Sequelize.JSON, allowNull: true });
    await queryInterface.addColumn('salons', 'priceRange', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('salons', 'cancellationPolicy', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('salons', 'resources', { type: Sequelize.JSON, allowNull: true });

    await queryInterface.removeColumn('salons', 'rating');
    await queryInterface.removeColumn('salons', 'reviewCount');
    await queryInterface.removeColumn('salons', 'distance');
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('salons', 'email');
    await queryInterface.removeColumn('salons', 'website');
    await queryInterface.removeColumn('salons', 'instagram');
    await queryInterface.removeColumn('salons', 'facebook');
    await queryInterface.removeColumn('salons', 'twitter');
    await queryInterface.removeColumn('salons', 'zipCode');
    await queryInterface.removeColumn('salons', 'daysOfOperation');
    await queryInterface.removeColumn('salons', 'priceRange');
    await queryInterface.removeColumn('salons', 'cancellationPolicy');
    await queryInterface.removeColumn('salons', 'resources');

    await queryInterface.addColumn('salons', 'rating', { type: Sequelize.FLOAT, allowNull: true });
    await queryInterface.addColumn('salons', 'reviewCount', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('salons', 'distance', { type: Sequelize.FLOAT, allowNull: true });
  }
};
