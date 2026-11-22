const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.use(express.urlencoded({ extended: true }));

function apiKeyFromReq(req) {
  return (req.query && req.query.api_key) || (req.body && req.body.api_key) || '';
}

router.get('/', async (req, res) => {
  res.render('index', { api_key: req.query.api_key || '', error: null });
});

router.get('/register', (req, res) => {
  res.render('register', { api_key: req.query.api_key || '', error: null, success: null });
});

router.post('/register', async (req, res) => {
  const { name, email } = req.body;
  try {
    const result = await query(
      'INSERT INTO accounts (name, email, api_key, balance) VALUES ($1, $2, $3, 0) RETURNING id, name, email, api_key, balance',
      [name.trim(), email.trim(), require('crypto').randomBytes(24).toString('hex')]
    );
    const row = result.rows[0];
    res.render('register', {
      api_key: row.api_key,
      error: null,
      success: 'Akun terdaftar. Salin API Key: ' + row.api_key,
    });
  } catch (err) {
    if (err.code === '23505') {
      res.render('register', { api_key: '', error: 'email sudah terdaftar', success: null });
    } else {
      res.render('register', { api_key: '', error: 'Terjadi kesalahan server', success: null });
    }
  }
});

router.get('/balance', async (req, res) => {
  const apiKey = apiKeyFromReq(req);
  const account = await query('SELECT id, name, balance FROM accounts WHERE api_key = $1', [apiKey]);
  if (account.rows.length === 0) {
    return res.render('balance', { api_key: apiKey, account: null, error: 'API key tidak valid' });
  }
  res.render('balance', {
    api_key: apiKey,
    account: account.rows[0],
    error: null,
  });
});

router.get('/topup', (req, res) => {
  res.render('topup', { api_key: req.query.api_key || '', error: null, success: null });
});

router.post('/topup', async (req, res) => {
  const { api_key, account_id, amount } = req.body;
  const idempotencyKey = req.body.idempotency_key || null;
  try {
    const accResult = await query('SELECT balance FROM accounts WHERE id = $1 AND api_key = $2 FOR UPDATE', [
      account_id,
      api_key,
    ]);
    if (accResult.rows.length === 0) {
      return res.render('topup', { api_key, error: 'Akun tidak ditemukan atau API key tidak valid', success: null });
    }
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum < 1000) {
      return res.render('topup', { api_key, error: 'Amount harus integer >= 1000', success: null });
    }
    const balanceBefore = Number(accResult.rows[0].balance);
    const balanceAfter = balanceBefore + amountNum;
    const txResult = await query(
      'INSERT INTO transfers (type, from_account_id, to_account_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['TOPUP', null, account_id, amountNum, idempotencyKey]
    );
    await query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfter, account_id]);
    await query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [account_id, txResult.rows[0].id, amountNum, balanceBefore, balanceAfter]
    );
    res.render('topup', {
      api_key,
      error: null,
      success: 'Top up berhasil. Saldo baru: Rp ' + balanceAfter.toLocaleString('id-ID'),
    });
  } catch (err) {
    if (err.code === '23505') {
      res.render('topup', { api_key, error: 'Idempotency key sudah digunakan', success: null });
    } else {
      res.render('topup', { api_key, error: 'Terjadi kesalahan server', success: null });
    }
  }
});

router.get('/transfer', (req, res) => {
  res.render('transfer', { api_key: req.query.api_key || '', error: null, success: null });
});

router.post('/transfer', async (req, res) => {
  const { api_key, from_account_id, to_account_id, amount } = req.body;
  const idempotencyKey = req.body.idempotency_key || null;
  const amountNum = Number(amount);
  try {
    if (Number(from_account_id) === Number(to_account_id)) {
      return res.render('transfer', { api_key, error: 'Tidak dapat transfer ke akun sendiri', success: null });
    }
    if (!Number.isInteger(amountNum) || amountNum < 1000) {
      return res.render('transfer', { api_key, error: 'Amount harus integer >= 1000', success: null });
    }

    const lockOrder = [Number(from_account_id), Number(to_account_id)].sort((a, b) => a - b);
    const locked = {};
    for (const id of lockOrder) {
      const resLock = await query('SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE', [id]);
      if (resLock.rows.length === 0) {
        return res.render('transfer', { api_key, error: 'Akun tidak ditemukan', success: null });
      }
      locked[id] = resLock.rows[0];
    }

    const fromRow = locked[Number(from_account_id)];
    const toRow = locked[Number(to_account_id)];
    const balanceBeforeFrom = Number(fromRow.balance);
    const balanceBeforeTo = Number(toRow.balance);

    const ownerCheck = await query('SELECT id FROM accounts WHERE id = $1 AND api_key = $2', [
      from_account_id,
      api_key,
    ]);
    if (ownerCheck.rows.length === 0) {
      return res.render('transfer', { api_key, error: 'API key tidak cocok dengan akun pengirim', success: null });
    }

    if (balanceBeforeFrom < amountNum) {
      return res.render('transfer', { api_key, error: 'Saldo tidak cukup', success: null });
    }

    const dailyResult = await query(
      `SELECT COALESCE(SUM(amount), 0) AS daily_total FROM transfers WHERE from_account_id = $1 AND type = 'TRANSFER' AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = CURRENT_DATE`,
      [from_account_id]
    );
    const dailyTotal = Number(dailyResult.rows[0].daily_total);
    if (dailyTotal + amountNum > 2000000) {
      return res.render('transfer', {
        api_key,
        error: 'Total transfer keluar per hari melebihi batas Rp 2.000.000',
        success: null,
      });
    }

    const balanceAfterFrom = balanceBeforeFrom - amountNum;
    const balanceAfterTo = balanceBeforeTo + amountNum;

    const txResult = await query(
      'INSERT INTO transfers (type, from_account_id, to_account_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['TRANSFER', from_account_id, to_account_id, amountNum, idempotencyKey]
    );
    await query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfterFrom, from_account_id]);
    await query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfterTo, to_account_id]);
    await query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [from_account_id, txResult.rows[0].id, amountNum, balanceBeforeFrom, balanceAfterFrom]
    );
    await query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [to_account_id, txResult.rows[0].id, amountNum, balanceBeforeTo, balanceAfterTo]
    );

    res.render('transfer', {
      api_key,
      error: null,
      success: 'Transfer berhasil. Saldo pengirim: Rp ' + balanceAfterFrom.toLocaleString('id-ID'),
    });
  } catch (err) {
    if (err.code === '23505') {
      res.render('transfer', { api_key, error: 'Idempotency key sudah digunakan', success: null });
    } else {
      res.render('transfer', { api_key, error: 'Terjadi kesalahan server', success: null });
    }
  }
});

router.get('/transactions', async (req, res) => {
  const apiKey = apiKeyFromReq(req);
  const account = await query('SELECT id, name FROM accounts WHERE api_key = $1', [apiKey]);
  if (account.rows.length === 0) {
    return res.render('transactions', { api_key: apiKey, account: null, transactions: [], error: 'API key tidak valid' });
  }
  const accId = account.rows[0].id;
  const result = await query(
    `SELECT l.id, l.amount, l.balance_before, l.balance_after, l.created_at,
            t.type, t.from_account_id, t.to_account_id, t.idempotency_key
     FROM ledger l
     JOIN transfers t ON l.transaction_id = t.id
     WHERE l.account_id = $1
     ORDER BY l.created_at DESC, l.id DESC`,
    [accId]
  );
  res.render('transactions', {
    api_key: apiKey,
    account: account.rows[0],
    transactions: result.rows.map(r => ({
      ...r,
      amount: Number(r.amount),
      balance_before: Number(r.balance_before),
      balance_after: Number(r.balance_after),
    })),
    error: null,
  });
});

module.exports = router;
