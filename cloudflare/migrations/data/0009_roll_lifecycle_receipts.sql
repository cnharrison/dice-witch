CREATE TABLE roll_lifecycle_receipts (
  interaction_id TEXT PRIMARY KEY
    CHECK (
      length(interaction_id) BETWEEN 17 AND 20
      AND interaction_id NOT GLOB '*[^0-9]*'
      AND substr(interaction_id, 1, 1) BETWEEN '1' AND '9'
    ),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  request_fingerprint TEXT NOT NULL
    CHECK (
      length(request_fingerprint) = 64
      AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
    ),
  command_name TEXT NOT NULL CHECK (command_name IN ('roll', 'library')),
  scope TEXT NOT NULL CHECK (scope IN ('guild', 'dm')),
  guild_id TEXT
    CHECK (
      guild_id IS NULL
      OR (
        length(guild_id) BETWEEN 17 AND 20
        AND guild_id NOT GLOB '*[^0-9]*'
        AND substr(guild_id, 1, 1) BETWEEN '1' AND '9'
      )
    ),
  user_id TEXT NOT NULL
    CHECK (
      length(user_id) BETWEEN 17 AND 20
      AND user_id NOT GLOB '*[^0-9]*'
      AND substr(user_id, 1, 1) BETWEEN '1' AND '9'
    ),
  channel_id TEXT NOT NULL
    CHECK (
      length(channel_id) BETWEEN 17 AND 20
      AND channel_id NOT GLOB '*[^0-9]*'
      AND substr(channel_id, 1, 1) BETWEEN '1' AND '9'
    ),
  received_at INTEGER NOT NULL CHECK (received_at >= 0),
  deferred_at INTEGER NOT NULL CHECK (deferred_at >= received_at),
  accepted_at INTEGER CHECK (accepted_at IS NULL OR accepted_at >= deferred_at),
  delivery_started_at INTEGER
    CHECK (
      delivery_started_at IS NULL
      OR delivery_started_at >= COALESCE(accepted_at, deferred_at)
    ),
  terminal_at INTEGER
    CHECK (
      terminal_at IS NULL
      OR terminal_at >= COALESCE(accepted_at, deferred_at)
    ),
  state TEXT NOT NULL
    CHECK (
      state IN ('deferred', 'accepted', 'delivery_started', 'delivered', 'failed')
    ),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  http_status INTEGER
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  failure_phase TEXT
    CHECK (
      failure_phase IS NULL
      OR (
        length(failure_phase) BETWEEN 1 AND 64
        AND failure_phase NOT GLOB '*[^a-z0-9-]*'
      )
    ),
  failure_code TEXT
    CHECK (
      failure_code IS NULL
      OR (
        length(failure_code) BETWEEN 1 AND 64
        AND failure_code NOT GLOB '*[^a-z0-9-]*'
      )
    ),
  context_json TEXT NOT NULL
    CHECK (
      json_valid(context_json)
      AND length(CAST(context_json AS BLOB)) <= 65536
    ),
  alert_state TEXT NOT NULL DEFAULT 'none'
    CHECK (
      alert_state IN (
        'none', 'sending', 'sent', 'update_due', 'updating', 'resolved',
        'failed'
      )
    ),
  alert_message_id TEXT
    CHECK (
      alert_message_id IS NULL
      OR (
        length(alert_message_id) BETWEEN 17 AND 20
        AND alert_message_id NOT GLOB '*[^0-9]*'
        AND substr(alert_message_id, 1, 1) BETWEEN '1' AND '9'
      )
    ),
  alert_attempts INTEGER NOT NULL DEFAULT 0 CHECK (alert_attempts >= 0),
  alert_lease_until INTEGER
    CHECK (alert_lease_until IS NULL OR alert_lease_until >= 0),
  alert_sent_at INTEGER CHECK (alert_sent_at IS NULL OR alert_sent_at >= 0),
  alert_resolved_at INTEGER
    CHECK (alert_resolved_at IS NULL OR alert_resolved_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= received_at),
  CHECK ((scope = 'guild') = (guild_id IS NOT NULL)),
  CHECK (
    (state = 'deferred' AND accepted_at IS NULL
      AND delivery_started_at IS NULL AND terminal_at IS NULL)
    OR
    (state = 'accepted' AND accepted_at IS NOT NULL
      AND delivery_started_at IS NULL AND terminal_at IS NULL)
    OR
    (state = 'delivery_started' AND accepted_at IS NOT NULL
      AND delivery_started_at IS NOT NULL AND terminal_at IS NULL)
    OR
    (state = 'delivered' AND accepted_at IS NOT NULL AND terminal_at IS NOT NULL)
    OR
    (state = 'failed' AND terminal_at IS NOT NULL)
  ),
  CHECK (
    (state = 'failed' AND failure_phase IS NOT NULL AND failure_code IS NOT NULL)
    OR
    (state != 'failed' AND failure_phase IS NULL AND failure_code IS NULL)
  ),
  CHECK (
    (alert_state IN ('none', 'sending') AND alert_message_id IS NULL)
    OR
    (alert_state IN ('sent', 'update_due', 'updating', 'resolved')
      AND alert_message_id IS NOT NULL)
    OR alert_state = 'failed'
  )
) STRICT;

CREATE INDEX idx_roll_lifecycle_watchdog
  ON roll_lifecycle_receipts (state, deferred_at, alert_state);

CREATE INDEX idx_roll_lifecycle_alert_work
  ON roll_lifecycle_receipts (alert_state, alert_lease_until, updated_at);

CREATE INDEX idx_roll_lifecycle_retention
  ON roll_lifecycle_receipts (received_at, interaction_id);
