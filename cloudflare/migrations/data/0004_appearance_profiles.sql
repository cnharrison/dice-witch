CREATE TABLE user_appearance_profiles (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  profile_json TEXT NOT NULL
    CHECK (
      length(profile_json) BETWEEN 2 AND 65536
      AND json_valid(profile_json)
      AND json_type(profile_json) = 'object'
    ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE CASCADE
) STRICT;

CREATE TABLE guild_appearance_profiles (
  guild_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  profile_json TEXT NOT NULL
    CHECK (
      length(profile_json) BETWEEN 2 AND 65536
      AND json_valid(profile_json)
      AND json_type(profile_json) = 'object'
    ),
  updated_by_user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  FOREIGN KEY (guild_id) REFERENCES guilds(id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION
) STRICT;
