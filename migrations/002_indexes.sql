-- migrations/002_indexes.sql
CREATE INDEX IF NOT EXISTS idx_transfers_from_created
  ON transfers(from_account_id, created_at);

DROP INDEX IF EXISTS idx_transfers_idempotency;