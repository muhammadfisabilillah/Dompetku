-- migrations/001_init.sql
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('TOPUP', 'TRANSFER')),
  from_account_id INTEGER REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  amount BIGINT NOT NULL CHECK (amount >= 1000),
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_account_created ON ledger(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);