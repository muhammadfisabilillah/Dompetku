require('../src/env');
const { runMigrations } = require('../src/migrate');

module.exports = async () => {
  await runMigrations();
};