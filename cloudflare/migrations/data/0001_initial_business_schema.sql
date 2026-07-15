CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT CHECK (name IS NULL OR length(name) <= 255),
  icon TEXT CHECK (icon IS NULL OR length(icon) <= 255),
  owner_id TEXT,
  member_count INTEGER CHECK (member_count IS NULL OR member_count >= 0),
  approximate_member_count INTEGER
    CHECK (approximate_member_count IS NULL OR approximate_member_count >= 0),
  preferred_locale TEXT
    CHECK (preferred_locale IS NULL OR length(preferred_locale) <= 255),
  joined_timestamp INTEGER
    CHECK (joined_timestamp IS NULL OR joined_timestamp >= 0),
  roll_count INTEGER CHECK (roll_count IS NULL OR roll_count >= 0),
  skip_dice_delay INTEGER NOT NULL DEFAULT 0
    CHECK (skip_dice_delay IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (updated_at >= 0),
  is_active INTEGER DEFAULT 1
    CHECK (is_active IS NULL OR is_active IN (0, 1))
) STRICT;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT CHECK (username IS NULL OR length(username) <= 255),
  email TEXT UNIQUE CHECK (email IS NULL OR length(email) <= 255),
  last_web_login INTEGER
    CHECK (last_web_login IS NULL OR last_web_login >= 0),
  flags INTEGER,
  discriminator TEXT
    CHECK (discriminator IS NULL OR length(discriminator) <= 255),
  avatar TEXT CHECK (avatar IS NULL OR length(avatar) <= 255),
  roll_count INTEGER CHECK (roll_count IS NULL OR roll_count >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (updated_at >= 0)
) STRICT;

CREATE TABLE users_guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK (id > 0),
  user_id TEXT,
  guild_id TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  is_dice_witch_admin INTEGER NOT NULL DEFAULT 0
    CHECK (is_dice_witch_admin IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (updated_at >= 0),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  FOREIGN KEY (guild_id) REFERENCES guilds(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  UNIQUE (user_id, guild_id)
) STRICT;

CREATE TABLE stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK (id > 0),
  rolls INTEGER CHECK (rolls IS NULL OR rolls >= 0),
  dice INTEGER CHECK (dice IS NULL OR dice >= 0),
  users INTEGER CHECK (users IS NULL OR users >= 0),
  total_count INTEGER CHECK (total_count IS NULL OR total_count >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    CHECK (updated_at >= 0)
) STRICT;

CREATE TABLE interaction_receipts (
  interaction_id TEXT PRIMARY KEY
    CHECK (
      length(interaction_id) BETWEEN 17 AND 20
      AND interaction_id NOT GLOB '*[^0-9]*'
      AND substr(interaction_id, 1, 1) BETWEEN '1' AND '9'
    ),
  command_name TEXT NOT NULL
    CHECK (length(command_name) BETWEEN 1 AND 32),
  guild_id TEXT
    CHECK (
      guild_id IS NULL
      OR (
        length(guild_id) BETWEEN 17 AND 20
        AND guild_id NOT GLOB '*[^0-9]*'
        AND substr(guild_id, 1, 1) BETWEEN '1' AND '9'
      )
    ),
  user_id TEXT
    CHECK (
      user_id IS NULL
      OR (
        length(user_id) BETWEEN 17 AND 20
        AND user_id NOT GLOB '*[^0-9]*'
        AND substr(user_id, 1, 1) BETWEEN '1' AND '9'
      )
    ),
  received_at INTEGER NOT NULL CHECK (received_at >= 0),
  accounted_at INTEGER CHECK (accounted_at IS NULL OR accounted_at >= 0)
) STRICT;

CREATE INDEX idx_guilds_active
  ON guilds (is_active, id);

CREATE INDEX idx_users_guilds_guild_id
  ON users_guilds (guild_id, user_id);

CREATE INDEX idx_interaction_receipts_unaccounted
  ON interaction_receipts (received_at, interaction_id)
  WHERE accounted_at IS NULL;
