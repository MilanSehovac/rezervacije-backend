'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
  await queryInterface.changeColumn('salons', 'daysOfOperation', {
    type: Sequelize.JSON,
    allowNull: true
  });

  },

  async down (queryInterface, Sequelize) {




    await queryInterface.changeColumn('salons', 'daysOfOperation', {
      type: Sequelize.TEXT('long'),
      allowNull: true
    });
  }
};
