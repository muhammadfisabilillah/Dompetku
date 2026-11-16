if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: '.env.test' });
} else {
  require('dotenv').config();
}
const fs = require('fs');
const path = require('path');
const { pool, query } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const res = await query('SELECT filename FROM migrations ORDER BY id');
  return new Set(res.rows.map(r => r.filename));
}

async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping already applied migration: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed to apply migration ${file}:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('All migrations applied.');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };