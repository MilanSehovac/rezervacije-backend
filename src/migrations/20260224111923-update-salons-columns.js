'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.renameColumn('salons', 'name', 'businessName');

    await queryInterface.removeColumn('salons', 'resources');

    await queryInterface.addColumn('salons', 'isApproved', { type: Sequelize.BOOLEAN, defaultValue: false });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.renameColumn('salons', 'businessName', 'name');

    await queryInterface.addColumn('salons', 'resources', { type: Sequelize.JSON, allowNull: true });

    await queryInterface.removeColumn('salons', 'isApproved');
  }
};
