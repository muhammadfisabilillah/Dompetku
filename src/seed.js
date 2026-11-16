if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: '.env.test' });
} else {
  require('dotenv').config();
}
const crypto = require('crypto');
const { pool, query } = require('./db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2 accounts with idempotent insert (ON CONFLICT DO NOTHING)
    const accounts = [
      { name: 'Budi', email: 'budi@kampus.ac.id', balance: 100000 },
      { name: 'Siti', email: 'siti@kampus.ac.id', balance: 50000 },
    ];

    for (const acc of accounts) {
      const apiKey = crypto.randomBytes(16).toString('hex');
      await client.query(
        `INSERT INTO accounts (name, email, api_key, balance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [acc.name, acc.email, apiKey, acc.balance]
      );
    }

    // Get account ids
    const { rows: accRows } = await client.query(
      'SELECT id, name, balance FROM accounts ORDER BY id LIMIT 2'
    );

    // TOPUP transaction + ledger for first account (idempotent via idempotency_key)
    if (accRows.length > 0) {
      const acc = accRows[0];
      const topupAmount = 50000;
      const idempotencyKey = 'seed-topup-1';

      // Check if transaction already exists
      const { rows: existingTx } = await client.query(
        'SELECT id FROM transactions WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      let txId;
      if (existingTx.length > 0) {
        txId = existingTx[0].id;
      } else {
        const { rows: txRows } = await client.query(
          `INSERT INTO transactions (type, from_account_id, to_account_id, amount, idempotency_key)
           VALUES ('TOPUP', NULL, $1, $2, $3) RETURNING id`,
          [acc.id, topupAmount, idempotencyKey]
        );
        txId = txRows[0].id;
      }

      // Insert ledger if not exists
      const { rows: existingLedger } = await client.query(
        'SELECT id FROM ledger WHERE transaction_id = $1 AND account_id = $2',
        [txId, acc.id]
      );
      if (existingLedger.length === 0) {
        const balanceBefore = Number(acc.balance) - topupAmount;
        const balanceAfter = Number(acc.balance);
        await client.query(
          `INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after)
           VALUES ($1, $2, $3, $4, $5)`,
          [acc.id, txId, topupAmount, balanceBefore, balanceAfter]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Seed completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
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