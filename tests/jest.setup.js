require('../src/env');
const { pool, query } = require('../src/db');

beforeAll(async () => {
  const connected = await query('SELECT 1').then(() => true).catch(() => false);
  if (!connected) {
    throw new Error('Cannot connect to database. Ensure PostgreSQL is running and migrations are applied.');
  }
});

afterEach(async () => {
  await query('TRUNCATE TABLE ledger, transactions, accounts RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});