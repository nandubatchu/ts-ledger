const Sequelize = require('sequelize');
const path = require('path');
const Umzug = require('umzug');

// creates a basic sqlite database
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, './db.sqlite'),
  });

const umzug = new Umzug({
  migrations: {
    // indicates the folder containing the migration .js files
    path: path.join(__dirname, './migrations'),
    // inject sequelize's QueryInterface in the migrations
    params: [
      sequelize.getQueryInterface()
    ]
  },
  // indicates that the migration data should be store in the database
  // itself through sequelize. The default configuration creates a table
  // named `SequelizeMeta`.
  storage: 'sequelize',
  storageOptions: { sequelize }
});

(async () => {
  // checks migrations and run them if they are not already applied
  await umzug.up();
  console.log('All migrations performed successfully');
})();