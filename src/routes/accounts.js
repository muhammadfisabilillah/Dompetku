require('../env');
const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
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

module.exports = router;