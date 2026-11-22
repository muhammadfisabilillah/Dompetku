require('../env');
const express = require('express');
const { authenticateApiKey } = require('../middleware/auth');
const { registerAccount, getAccountBalance, topupAccount, transferFunds, getAccountTransactions } = require('../services/accountService');

const router = express.Router();

router.post('/accounts', async (req, res) => {
  const { name, email } = req.body || {};
  try {
    const account = await registerAccount(name, email);
    return res.status(201).json(account);
  } catch (err) {
    if (err.status === 422) {
      return res.status(422).json({ error: err.message });
    }
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/accounts/:id/balance', authenticateApiKey, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await getAccountBalance(id, req.account.id);
    return res.status(200).json({
      id: req.account.id,
      name: req.account.name,
      balance: req.account.balance,
    });
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ error: err.message });
    }
    console.error('Balance error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/accounts/:id/topup', authenticateApiKey, async (req, res) => {
  const id = Number(req.params.id);
  const { amount } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'] || null;

  try {
    const result = await topupAccount(id, amount, idempotencyKey, req.account.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ error: err.message });
    }
    if (err.status === 422) {
      return res.status(422).json({ error: err.message });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error('Topup error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/transfers', authenticateApiKey, async (req, res) => {
  const { from_account_id, to_account_id, amount } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'] || null;

  try {
    const result = await transferFunds(
      Number(from_account_id),
      Number(to_account_id),
      amount,
      idempotencyKey,
      req.account.id
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ error: err.message });
    }
    if (err.status === 422) {
      return res.status(422).json({ error: err.message });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error('Transfer error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/accounts/:id/transactions', authenticateApiKey, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const transactions = await getAccountTransactions(id, req.account.id);
    return res.status(200).json({ id, transactions });
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ error: err.message });
    }
    console.error('Transactions error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
