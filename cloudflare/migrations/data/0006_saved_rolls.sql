CREATE TABLE user_saved_roll_lists (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE CASCADE
) STRICT;

CREATE TABLE guild_saved_roll_lists (
  guild_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  FOREIGN KEY (guild_id) REFERENCES guilds(id)
    ON UPDATE NO ACTION ON DELETE CASCADE
) STRICT;

CREATE TABLE saved_rolls (
  id TEXT PRIMARY KEY
    CHECK (
      length(id) = 36
      AND substr(id, 9, 1) = '-'
      AND substr(id, 14, 1) = '-'
      AND substr(id, 15, 1) = '4'
      AND substr(id, 19, 1) = '-'
      AND substr(id, 20, 1) IN ('8', '9', 'a', 'b')
      AND substr(id, 24, 1) = '-'
      AND id NOT GLOB '*[^0-9a-f-]*'
    ),
  user_id TEXT,
  guild_id TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 1024),
  comparison_key TEXT NOT NULL CHECK (length(comparison_key) BETWEEN 1 AND 2048),
  notation TEXT NOT NULL CHECK (length(notation) BETWEEN 1 AND 6000),
  title TEXT CHECK (title IS NULL OR length(title) BETWEEN 1 AND 256),
  repetitions INTEGER NOT NULL CHECK (repetitions BETWEEN 1 AND 50),
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
  manual_order INTEGER NOT NULL CHECK (manual_order >= 0),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  CHECK ((user_id IS NOT NULL) <> (guild_id IS NOT NULL)),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (guild_id) REFERENCES guilds(id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION
) STRICT;

CREATE UNIQUE INDEX idx_saved_rolls_user_name
  ON saved_rolls(user_id, comparison_key)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_saved_rolls_guild_name
  ON saved_rolls(guild_id, comparison_key)
  WHERE guild_id IS NOT NULL;
CREATE UNIQUE INDEX idx_saved_rolls_user_order
  ON saved_rolls(user_id, manual_order)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_saved_rolls_guild_order
  ON saved_rolls(guild_id, manual_order)
  WHERE guild_id IS NOT NULL;
CREATE INDEX idx_saved_rolls_user_list
  ON saved_rolls(user_id, pinned DESC, manual_order, id)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_saved_rolls_guild_list
  ON saved_rolls(guild_id, pinned DESC, manual_order, id)
  WHERE guild_id IS NOT NULL;
