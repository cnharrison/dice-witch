CREATE TABLE discord_audience_snapshot (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version = 1),
  captured_at INTEGER NOT NULL CHECK (captured_at >= 0),
  live_guilds INTEGER NOT NULL CHECK (live_guilds >= 0),
  estimated_guild_memberships INTEGER NOT NULL
    CHECK (estimated_guild_memberships >= 0),
  known_dice_witch_users INTEGER NOT NULL
    CHECK (known_dice_witch_users >= 0),
  shard_count INTEGER NOT NULL CHECK (shard_count > 0),
  guild_counts_by_shard_json TEXT NOT NULL
    CHECK (
      json_valid(guild_counts_by_shard_json)
      AND json_type(guild_counts_by_shard_json) = 'array'
    )
) STRICT;
