CREATE TABLE discord_channel_directory (
  channel_id TEXT PRIMARY KEY NOT NULL
    CHECK (
      length(channel_id) BETWEEN 17 AND 20
      AND channel_id NOT GLOB '*[^0-9]*'
      AND substr(channel_id, 1, 1) BETWEEN '1' AND '9'
    ),
  guild_id TEXT NOT NULL
    CHECK (
      length(guild_id) BETWEEN 17 AND 20
      AND guild_id NOT GLOB '*[^0-9]*'
      AND substr(guild_id, 1, 1) BETWEEN '1' AND '9'
    ),
  channel_name TEXT
    CHECK (channel_name IS NULL OR length(channel_name) BETWEEN 1 AND 100),
  channel_type INTEGER
    CHECK (channel_type IS NULL OR channel_type IN (0, 2, 5, 10, 11, 12, 13, 15, 16)),
  source TEXT NOT NULL
    CHECK (source IN ('gateway', 'interaction', 'lifecycle', 'rest')),
  is_deleted INTEGER NOT NULL
    CHECK (is_deleted IN (0, 1)),
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at >= observed_at),
  CHECK (
    (is_deleted = 0 AND channel_name IS NOT NULL AND channel_type IS NOT NULL)
    OR
    (is_deleted = 1 AND channel_name IS NULL AND channel_type IS NULL)
  )
) STRICT;

CREATE INDEX discord_channel_directory_expiry_idx
  ON discord_channel_directory (expires_at);
