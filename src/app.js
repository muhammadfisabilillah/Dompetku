require('./env');
const express = require('express');
const { checkConnection } = require('./db');

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  const dbConnected = await checkConnection();
  if (dbConnected) {
    return res.status(200).json({ status: 'ok', database: 'up' });
  }
  return res.status(503).json({ status: 'error', database: 'down' });
});

module.exports = app;