-- Records delivered receipts that game detection cannot ingest so the
-- oldest-first scan skips them instead of freezing on a poison row.
CREATE TABLE game_detection_skipped_receipts (
  interaction_id TEXT PRIMARY KEY CHECK (length(interaction_id) BETWEEN 1 AND 64),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 100),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

CREATE INDEX game_detection_skipped_receipts_created
  ON game_detection_skipped_receipts(created_at);
