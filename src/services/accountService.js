const crypto = require('crypto');
const { query, getClient } = require('../db');

async function registerAccount(name, email) {
  if (typeof name !== 'string' || name.trim() === '' || typeof email !== 'string' || email.trim() === '') {
    const err = new Error('name dan email wajib diisi');
    err.status = 422;
    throw err;
  }

  const apiKey = crypto.randomBytes(24).toString('hex');
  try {
    const result = await query(
      'INSERT INTO accounts (name, email, api_key, balance) VALUES ($1, $2, $3, 0) RETURNING id, name, email, api_key, balance',
      [name.trim(), email.trim(), apiKey]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      api_key: row.api_key,
      balance: Number(row.balance),
    };
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('email sudah terdaftar');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

async function getAccountBalance(accountId, requestingAccountId) {
  if (requestingAccountId !== accountId) {
    const err = new Error('tidak berhak mengakses akun ini');
    err.status = 403;
    throw err;
  }
  return {
    id: accountId,
    balance: null,
  };
}

async function topupAccount(accountId, amount, idempotencyKey, requestingAccountId) {
  if (requestingAccountId !== accountId) {
    const err = new Error('tidak berhak mengakses akun ini');
    err.status = 403;
    throw err;
  }

  if (!Number.isInteger(amount) || amount < 1000) {
    const err = new Error('amount harus integer >= 1000');
    err.status = 422;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT t.id, t.amount, l.balance_before, l.balance_after FROM transfers t JOIN ledger l ON l.transaction_id = t.id WHERE t.idempotency_key = $1 AND t.type = $2 AND t.to_account_id = $3',
        [idempotencyKey, 'TOPUP', accountId]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        await client.query('COMMIT');
        return {
          status: 200,
          body: {
            transaction_id: row.id,
            amount: Number(row.amount),
            balance_before: Number(row.balance_before),
            balance_after: Number(row.balance_after),
            balance: Number(row.balance_after),
          },
        };
      }
    }

    const accResult = await client.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
    if (accResult.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error('akun tidak ditemukan');
      err.status = 404;
      throw err;
    }
    const balanceBefore = Number(accResult.rows[0].balance);
    const balanceAfter = balanceBefore + amount;

    const txResult = await client.query(
      'INSERT INTO transfers (type, from_account_id, to_account_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['TOPUP', null, accountId, amount, idempotencyKey]
    );
    const txId = txResult.rows[0].id;

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfter, accountId]);

    await client.query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [accountId, txId, amount, balanceBefore, balanceAfter]
    );

    await client.query('COMMIT');
    return {
      status: 201,
      body: {
        transaction_id: txId,
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        balance: balanceAfter,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const e = new Error('idempotency key sudah digunakan');
      e.status = 409;
      throw e;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function transferFunds(fromAccountId, toAccountId, amount, idempotencyKey, requestingAccountId) {
  if (requestingAccountId !== fromAccountId) {
    const err = new Error('tidak berhak mengakses akun ini');
    err.status = 403;
    throw err;
  }

  if (fromAccountId === toAccountId) {
    const err = new Error('tidak dapat transfer ke akun sendiri');
    err.status = 422;
    throw err;
  }

  if (!Number.isInteger(amount) || amount < 1000) {
    const err = new Error('amount harus integer >= 1000');
    err.status = 422;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT t.id, t.amount FROM transfers t WHERE t.idempotency_key = $1 AND t.type = $2',
        [idempotencyKey, 'TRANSFER']
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        await client.query('COMMIT');
        return {
          status: 200,
          body: {
            transaction_id: row.id,
            type: 'TRANSFER',
            from_account_id: fromAccountId,
            to_account_id: toAccountId,
            amount: Number(row.amount),
          },
        };
      }
    }

    // Lock both accounts in ascending id order to prevent deadlock
    const lockOrder = [fromAccountId, toAccountId].sort((a, b) => a - b);
    const locked = {};
    for (const id of lockOrder) {
      const res = await client.query('SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE', [id]);
      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('akun tidak ditemukan');
        err.status = 404;
        throw err;
      }
      locked[id] = res.rows[0];
    }

    const fromRow = locked[fromAccountId];
    const toRow = locked[toAccountId];

    const balanceBeforeFrom = Number(fromRow.balance);
    const balanceBeforeTo = Number(toRow.balance);

    if (balanceBeforeFrom < amount) {
      await client.query('ROLLBACK');
      const err = new Error('saldo tidak cukup');
      err.status = 422;
      throw err;
    }

    // Limit transfer keluar harian (WIB) maksimal Rp 2.000.000 per akun
    const now = new Date();
    const wibDateStr = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS daily_total
       FROM transfers
       WHERE from_account_id = $1
         AND type = 'TRANSFER'
         AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date = $2::date`,
      [fromAccountId, wibDateStr]
    );
    const dailyTotal = Number(dailyResult.rows[0].daily_total);
    if (dailyTotal + amount > 2000000) {
      await client.query('ROLLBACK');
      const err = new Error('total transfer keluar per hari melebihi batas Rp 2.000.000');
      err.status = 422;
      throw err;
    }

    const balanceAfterFrom = balanceBeforeFrom - amount;
    const balanceAfterTo = balanceBeforeTo + amount;

    const txResult = await client.query(
      'INSERT INTO transfers (type, from_account_id, to_account_id, amount, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['TRANSFER', fromAccountId, toAccountId, amount, idempotencyKey]
    );
    const txId = txResult.rows[0].id;

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfterFrom, fromAccountId]);
    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [balanceAfterTo, toAccountId]);

    await client.query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [fromAccountId, txId, amount, balanceBeforeFrom, balanceAfterFrom]
    );
    await client.query(
      'INSERT INTO ledger (account_id, transaction_id, amount, balance_before, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [toAccountId, txId, amount, balanceBeforeTo, balanceAfterTo]
    );

    await client.query('COMMIT');
    return {
      status: 201,
      body: {
        transaction_id: txId,
        type: 'TRANSFER',
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        balance_before: balanceBeforeFrom,
        balance_after: balanceAfterFrom,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const e = new Error('idempotency key sudah digunakan');
      e.status = 409;
      throw e;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function getAccountTransactions(accountId, requestingAccountId) {
  if (requestingAccountId !== accountId) {
    const err = new Error('tidak berhak mengakses akun ini');
    err.status = 403;
    throw err;
  }

  const result = await query(
    `SELECT l.id, l.amount, l.balance_before, l.balance_after, l.created_at,
            t.type, t.from_account_id, t.to_account_id, t.idempotency_key
     FROM ledger l
     JOIN transfers t ON l.transaction_id = t.id
     WHERE l.account_id = $1
     ORDER BY l.created_at DESC, l.id DESC`,
    [accountId]
  );

  return result.rows.map(row => ({
    id: row.id,
    type: row.type,
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    amount: Number(row.amount),
    balance_before: Number(row.balance_before),
    balance_after: Number(row.balance_after),
    idempotency_key: row.idempotency_key,
    created_at: row.created_at,
  }));
}

module.exports = { registerAccount, getAccountBalance, topupAccount, transferFunds, getAccountTransactions };
