ALTER TABLE interaction_receipts
  ADD COLUMN request_fingerprint TEXT
  CHECK (
    request_fingerprint IS NULL OR
    (
      length(request_fingerprint) = 64 AND
      request_fingerprint NOT GLOB '*[^0-9a-f]*'
    )
  );

CREATE TABLE mutation_receipts (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  CHECK (length(mutation_id) BETWEEN 1 AND 255),
  CHECK (entity_type IN ('guild', 'user', 'membership')),
  CHECK (length(entity_key) BETWEEN 1 AND 255),
  CHECK (operation = 'upsert'),
  CHECK (json_valid(payload_json)),
  CHECK (occurred_at >= 0)
) STRICT;
