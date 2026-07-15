CREATE TABLE web_sessions (
  token_hash TEXT PRIMARY KEY
    CHECK (
      length(token_hash) = 64
      AND token_hash NOT GLOB '*[^0-9a-f]*'
    ),
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  revoked_at INTEGER
    CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE CASCADE
) STRICT;

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY
    CHECK (
      length(state_hash) = 64
      AND state_hash NOT GLOB '*[^0-9a-f]*'
    ),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  consumed_at INTEGER
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
) STRICT;

CREATE INDEX idx_web_sessions_active_expiry
  ON web_sessions (expires_at, token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_oauth_states_unconsumed_expiry
  ON oauth_states (expires_at, state_hash)
  WHERE consumed_at IS NULL;
