const Sequelize = require('sequelize');

// All migrations must provide a `up` and `down` async functions
module.exports = {
  // `query` was passed in the `index.js` file
  async up(query) {
    await query.changeColumn('posting_entries', 'operationId', {
        type: 'INTEGER USING CAST("operationId" as INTEGER)',
        allowNull: false,
    });
    await query.changeColumn('posting_entries', 'bookId', {
        type: 'INTEGER USING CAST("operationId" as INTEGER)',
        allowNull: false,
    });
  },
  async down(query) {
    await query.changeColumn('posting_entries', 'operationId', {
        type: Sequelize.STRING,
        allowNull: false,
    });
    await query.changeColumn('posting_entries', 'bookId', {
        type: Sequelize.STRING,
        allowNull: false,
    });  
  }
};