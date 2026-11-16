require('../env');
const express = require('express');
const crypto = require('crypto');
const { query, getClient } = require('../db');
const { authenticateApiKey } = require('../middleware/auth');

const router = express.Router();

router.post('/accounts', async (req, res) => {
  const { name, email } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '' || typeof email !== 'string' || email.trim() === '') {
    return res.status(422).json({ error: 'name dan email wajib diisi' });
  }

  const apiKey = crypto.randomBytes(24).toString('hex');
  try {
    const result = await query(
      'INSERT INTO accounts (name, email, api_key, balance) VALUES ($1, $2, $3, 0) RETURNING id, name, email, api_key, balance',
      [name.trim(), email.trim(), apiKey]
    );
    const row = result.rows[0];
    return res.status(201).json({
      id: row.id,
      name: row.name,
      email: row.email,
      api_key: row.api_key,
      balance: Number(row.balance),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email sudah terdaftar' });
    }
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/accounts/:id/balance', authenticateApiKey, async (req, res) => {
  const id = Number(req.params.id);
  if (req.account.id !== id) {
    return res.status(403).json({ error: 'tidak berhak mengakses akun ini' });
  }
  return res.status(200).json({
    id: req.account.id,
    name: req.account.name,
    balance: req.account.balance,
  });
});

router.post('/accounts/:id/topup', authenticateApiKey, async (req, res) => {
  const id = Number(req.params.id);
  if (req.account.id !== id) {
    return res.status(403).json({ error: 'tidak berhak mengakses akun ini' });
  }

  const { amount } = req.body || {};
  if (!Number.isInteger(amount) || amount < 1000) {
    return res.status(422).json({ error: 'amount harus integer >= 1000' });
  }

  const idempotencyKey = req.headers['idempotency-key'] || null;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT t.id, t.amount, l.balance_before, l.balance_after FROM transactions t JOIN ledger l ON l.transaction_id = t.id WHERE t.idempotency_key = $1 AND t.type = $2 AND t.to_account_id = $3',
        [idempotencyKey, 'TOPUP', id]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        await client.query('COMMIT');
        return res.status(200).json({
          transaction_id: row.id,
          amount: Number(row.amount),
          balance_before: Number(row.balance_before),
          balance_after: Number(row.balance_after),
          balance: Number(row.balance_after),
        });
      }
    }

    const accResult = await client.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [id]);
    const balanceBefore = Number(accResult.rows[0].balance);
    const balanceAfter = balanceBefore + amount;

    const txResult = await client.query(
      'INSERT INTO transactions (type, from_account_id, to_account_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['TOPUP', null, id, amount, idempotencyKey]
    );
    const txId = txResult.rows[0].id;

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfter, id]);

    await client.query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [id, txId, amount, balanceBefore, balanceAfter]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      transaction_id: txId,
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      balance: balanceAfter,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'idempotency key sudah digunakan' });
    }
    console.error('Topup error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;