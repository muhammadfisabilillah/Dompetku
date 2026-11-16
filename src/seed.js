require('./env');
const crypto = require('crypto');
const { pool, query } = require('./db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2 accounts with balance 0
    const accounts = [
      { name: 'Budi', email: 'budi@kampus.ac.id' },
      { name: 'Siti', email: 'siti@kampus.ac.id' },
    ];

    for (const acc of accounts) {
      const apiKey = crypto.randomBytes(16).toString('hex');
      await client.query(
        `INSERT INTO accounts (name, email, api_key, balance)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (email) DO NOTHING`,
        [acc.name, acc.email, apiKey]
      );
    }

    // TOPUP transactions + ledger
    const topups = [
      { email: 'budi@kampus.ac.id', amount: 100000, key: 'seed-topup-budi' },
      { email: 'siti@kampus.ac.id', amount: 50000, key: 'seed-topup-siti' },
    ];

    for (const t of topups) {
      const { rows: accRows } = await client.query(
        'SELECT id FROM accounts WHERE email = $1',
        [t.email]
      );
      if (accRows.length === 0) continue;
      const accId = accRows[0].id;

      // Idempotent transaction insert
      const { rows: existingTx } = await client.query(
        'SELECT id FROM transactions WHERE idempotency_key = $1',
        [t.key]
      );

      let txId;
      if (existingTx.length > 0) {
        txId = existingTx[0].id;
      } else {
        const { rows: txRows } = await client.query(
          `INSERT INTO transactions (type, from_account_id, to_account_id, amount, idempotency_key)
           VALUES ('TOPUP', NULL, $1, $2, $3) RETURNING id`,
          [accId, t.amount, t.key]
        );
        txId = txRows[0].id;
      }

      // Idempotent ledger insert
      const { rows: existingLedger } = await client.query(
        'SELECT id FROM ledger WHERE transaction_id = $1 AND account_id = $2',
        [txId, accId]
      );
      if (existingLedger.length === 0) {
        await client.query(
          `INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after)
           VALUES ($1, $2, $3, 0, $4)`,
          [accId, txId, t.amount, t.amount]
        );
        // Update account balance
        await client.query(
          'UPDATE accounts SET balance = $1 WHERE id = $2',
          [t.amount, accId]
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