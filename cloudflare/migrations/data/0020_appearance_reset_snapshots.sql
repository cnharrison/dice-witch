CREATE TABLE user_appearance_reset_snapshots (
  user_id TEXT PRIMARY KEY,
  mix_json TEXT NOT NULL
    CHECK (
      length(mix_json) BETWEEN 2 AND 65536
      AND json_valid(mix_json)
      AND json_type(mix_json) = 'object'
    ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE CASCADE
) STRICT;

CREATE TABLE guild_appearance_reset_snapshots (
  guild_id TEXT PRIMARY KEY,
  mix_json TEXT NOT NULL
    CHECK (
      length(mix_json) BETWEEN 2 AND 65536
      AND json_valid(mix_json)
      AND json_type(mix_json) = 'object'
    ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  FOREIGN KEY (guild_id) REFERENCES guilds(id)
    ON UPDATE NO ACTION ON DELETE CASCADE
) STRICT;
