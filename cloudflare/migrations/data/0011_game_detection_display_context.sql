ALTER TABLE game_detection_sessions
  ADD COLUMN guild_name TEXT
  CHECK (guild_name IS NULL OR length(guild_name) BETWEEN 1 AND 100);

ALTER TABLE game_detection_sessions
  ADD COLUMN channel_name TEXT
  CHECK (channel_name IS NULL OR length(channel_name) BETWEEN 1 AND 100);

ALTER TABLE game_detection_sessions
  ADD COLUMN channel_type INTEGER
  CHECK (channel_type IS NULL OR channel_type BETWEEN 0 AND 20);

ALTER TABLE game_detection_sessions
  ADD COLUMN channel_context_checked_at INTEGER
  CHECK (channel_context_checked_at IS NULL OR channel_context_checked_at >= 0);

ALTER TABLE game_detection_sessions
  ADD COLUMN channel_context_retry_at INTEGER
  CHECK (channel_context_retry_at IS NULL OR channel_context_retry_at >= 0);

UPDATE game_detection_sessions AS session
SET guild_name = COALESCE(
      (
        SELECT json_extract(receipt.context_json, '$.guildName')
        FROM game_detection_rolls AS observed
        JOIN roll_lifecycle_receipts AS receipt
          ON receipt.interaction_id = observed.interaction_id
        WHERE observed.session_id = session.session_id
          AND json_extract(receipt.context_json, '$.guildName') IS NOT NULL
        ORDER BY observed.observed_at DESC, observed.interaction_id DESC
        LIMIT 1
      ),
      (
        SELECT guild.name
        FROM guilds AS guild
        WHERE guild.id = session.guild_id
          AND length(guild.name) BETWEEN 1 AND 100
      )
    ),
    channel_name = (
      SELECT json_extract(receipt.context_json, '$.channelName')
      FROM game_detection_rolls AS observed
      JOIN roll_lifecycle_receipts AS receipt
        ON receipt.interaction_id = observed.interaction_id
      WHERE observed.session_id = session.session_id
        AND json_extract(receipt.context_json, '$.channelName') IS NOT NULL
      ORDER BY observed.observed_at DESC, observed.interaction_id DESC
      LIMIT 1
    ),
    channel_type = (
      SELECT json_extract(receipt.context_json, '$.channelType')
      FROM game_detection_rolls AS observed
      JOIN roll_lifecycle_receipts AS receipt
        ON receipt.interaction_id = observed.interaction_id
      WHERE observed.session_id = session.session_id
        AND json_extract(receipt.context_json, '$.channelType') IS NOT NULL
      ORDER BY observed.observed_at DESC, observed.interaction_id DESC
      LIMIT 1
    );

UPDATE game_detection_sessions
SET channel_context_checked_at = updated_at
WHERE scope = 'dm'
   OR (channel_name IS NOT NULL AND channel_type IS NOT NULL);

DROP VIEW game_detection_titled_rolls_90d;

CREATE VIEW game_detection_titled_rolls_90d AS
SELECT observed.interaction_id,
       observed.session_id,
       observed.observed_at,
       observed.classification,
       observed.game_id,
       receipt.command_name,
       receipt.scope,
       json_extract(receipt.context_json, '$.title') AS title,
       COALESCE(
         json_extract(receipt.context_json, '$.guildName'),
         session.guild_name
       ) AS guild_name,
       COALESCE(
         json_extract(receipt.context_json, '$.channelName'),
         session.channel_name
       ) AS channel_name,
       json_extract(receipt.context_json, '$.notation') AS notation
FROM game_detection_rolls AS observed
JOIN game_detection_sessions AS session
  ON session.session_id = observed.session_id
JOIN roll_lifecycle_receipts AS receipt
  ON receipt.interaction_id = observed.interaction_id
WHERE observed.has_title = 1;
