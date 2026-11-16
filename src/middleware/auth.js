require('../env');
const { query } = require('../db');

async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey.trim() === '') {
    return res.status(401).json({ error: 'API key wajib disertakan' });
  }
  try {
    const result = await query('SELECT id, name, email, api_key, balance FROM accounts WHERE api_key = $1', [apiKey]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'API key tidak valid' });
    }
    const row = result.rows[0];
    req.account = {
      id: row.id,
      name: row.name,
      email: row.email,
      api_key: row.api_key,
      balance: Number(row.balance),
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { authenticateApiKey };