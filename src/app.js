require('./env');
const express = require('express');
const { checkConnection } = require('./db');
const accountsRouter = require('./routes/accounts');
const webRouter = require('./routes/web');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/../views');

app.use(webRouter);
app.use(accountsRouter);

app.get('/health', async (req, res) => {
  const dbConnected = await checkConnection();
  if (dbConnected) {
    return res.status(200).json({ status: 'ok', database: 'up' });
  }
  return res.status(503).json({ status: 'error', database: 'down' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'route tidak ditemukan' });
});

module.exports = app;
