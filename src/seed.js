require('./env');
const crypto = require('crypto');
const { query } = require('./db');
const { topupAccount } = require('./services/accountService');

async function seed() {
  const accounts = [
    { name: 'Budi', email: 'budi@kampus.ac.id' },
    { name: 'Siti', email: 'siti@kampus.ac.id' },
  ];

  for (const acc of accounts) {
    const apiKey = crypto.randomBytes(16).toString('hex');
    await query(
      `INSERT INTO accounts (name, email, api_key, balance)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (email) DO NOTHING`,
      [acc.name, acc.email, apiKey]
    );
  }

  const topups = [
    { email: 'budi@kampus.ac.id', amount: 100000, key: 'seed-topup-budi' },
    { email: 'siti@kampus.ac.id', amount: 50000, key: 'seed-topup-siti' },
  ];

  for (const t of topups) {
    const { rows: accRows } = await query(
      'SELECT id FROM accounts WHERE email = $1',
      [t.email]
    );
    if (accRows.length === 0) continue;
    const accId = accRows[0].id;

    await topupAccount(accId, t.amount, t.key, accId);
  }

  console.log('Seed completed.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
