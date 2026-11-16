-- migrations/002_indexes.sql
CREATE INDEX IF NOT EXISTS idx_transactions_from_created
  ON transactions(from_account_id, created_at);

DROP INDEX IF EXISTS idx_transactions_idempotency;