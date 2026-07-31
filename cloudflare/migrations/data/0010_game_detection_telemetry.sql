CREATE INDEX idx_game_detection_source_receipts
  ON roll_lifecycle_receipts(received_at, interaction_id)
  WHERE state = 'delivered';

CREATE TABLE game_detection_control (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  started_at INTEGER NOT NULL CHECK (started_at >= 0)
) STRICT;

INSERT INTO game_detection_control (singleton, started_at)
VALUES (1, unixepoch() * 1000);

CREATE TABLE game_detection_sessions (
  session_id TEXT PRIMARY KEY CHECK (length(session_id) BETWEEN 1 AND 64),
  scope TEXT NOT NULL CHECK (scope IN ('guild', 'dm')),
  guild_id TEXT,
  channel_id TEXT NOT NULL CHECK (length(channel_id) BETWEEN 1 AND 32),
  started_at INTEGER NOT NULL CHECK (started_at >= 0),
  last_roll_at INTEGER NOT NULL CHECK (last_roll_at >= started_at),
  roll_count INTEGER NOT NULL CHECK (roll_count >= 1),
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  current_game_id TEXT CHECK (
    current_game_id IS NULL
    OR (length(current_game_id) BETWEEN 1 AND 100 AND current_game_id NOT GLOB '*[^a-z0-9-]*')
  ),
  current_confidence TEXT CHECK (
    current_confidence IS NULL
    OR current_confidence IN ('plausible', 'strong', 'distinctive')
  ),
  current_game_detected_at INTEGER CHECK (
    current_game_detected_at IS NULL OR current_game_detected_at >= started_at
  ),
  last_candidate_signature TEXT CHECK (
    last_candidate_signature IS NULL OR length(last_candidate_signature) = 64
  ),
  last_candidate_disposition TEXT CHECK (
    last_candidate_disposition IS NULL
    OR last_candidate_disposition IN ('selected', 'unknown')
  ),
  closed_at INTEGER CHECK (closed_at IS NULL OR closed_at >= last_roll_at),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  CHECK (
    (scope = 'guild' AND guild_id IS NOT NULL AND length(guild_id) BETWEEN 1 AND 32)
    OR (scope = 'dm' AND guild_id IS NULL)
  ),
  CHECK (
    (state = 'open' AND closed_at IS NULL)
    OR (state = 'closed' AND closed_at IS NOT NULL)
  ),
  CHECK (
    (current_game_id IS NULL AND current_confidence IS NULL AND current_game_detected_at IS NULL)
    OR (current_game_id IS NOT NULL AND current_confidence IS NOT NULL AND current_game_detected_at IS NOT NULL)
  ),
  CHECK (
    (last_candidate_signature IS NULL AND last_candidate_disposition IS NULL)
    OR (last_candidate_signature IS NOT NULL AND last_candidate_disposition IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX game_detection_one_open_session_per_channel
  ON game_detection_sessions(channel_id)
  WHERE state = 'open';
CREATE INDEX game_detection_sessions_expiry
  ON game_detection_sessions(state, last_roll_at);

CREATE TABLE game_detection_rolls (
  interaction_id TEXT PRIMARY KEY CHECK (length(interaction_id) BETWEEN 1 AND 64),
  session_id TEXT NOT NULL REFERENCES game_detection_sessions(session_id) ON DELETE CASCADE,
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  has_title INTEGER NOT NULL CHECK (has_title IN (0, 1)),
  classification TEXT NOT NULL CHECK (
    classification IN ('pending', 'in-game', 'unknown', 'out-of-game')
  ),
  game_id TEXT CHECK (
    game_id IS NULL
    OR (length(game_id) BETWEEN 1 AND 100 AND game_id NOT GLOB '*[^a-z0-9-]*')
  ),
  expires_at INTEGER NOT NULL CHECK (expires_at > observed_at),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  CHECK (
    (classification = 'in-game' AND game_id IS NOT NULL)
    OR (classification != 'in-game' AND game_id IS NULL)
  )
) STRICT;

CREATE INDEX game_detection_rolls_session_time
  ON game_detection_rolls(session_id, observed_at);
CREATE INDEX game_detection_rolls_retention
  ON game_detection_rolls(expires_at);

CREATE TABLE game_detection_rank_jobs (
  session_id TEXT PRIMARY KEY REFERENCES game_detection_sessions(session_id) ON DELETE CASCADE,
  candidate_signature TEXT NOT NULL CHECK (length(candidate_signature) = 64),
  feature_request_json TEXT NOT NULL CHECK (json_valid(feature_request_json)),
  state TEXT NOT NULL CHECK (state IN ('pending', 'processing', 'completed')),
  attempt_count INTEGER NOT NULL CHECK (attempt_count IN (0, 1)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  started_at INTEGER CHECK (started_at IS NULL OR started_at >= created_at),
  completed_at INTEGER CHECK (completed_at IS NULL OR completed_at >= created_at),
  result TEXT CHECK (
    result IS NULL OR result IN ('selected', 'abstained', 'rejected', 'failed')
  ),
  detail TEXT CHECK (detail IS NULL OR length(detail) BETWEEN 1 AND 100),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CHECK (
    (state = 'pending' AND attempt_count = 0 AND started_at IS NULL AND completed_at IS NULL AND result IS NULL AND detail IS NULL AND latency_ms IS NULL)
    OR (state = 'processing' AND attempt_count = 1 AND started_at IS NOT NULL AND completed_at IS NULL AND result IS NULL AND detail IS NULL AND latency_ms IS NULL)
    OR (state = 'completed' AND attempt_count = 1 AND started_at IS NOT NULL AND completed_at IS NOT NULL AND result IS NOT NULL)
  )
) STRICT;

CREATE INDEX game_detection_rank_jobs_pending
  ON game_detection_rank_jobs(state, created_at);

CREATE TABLE game_detections (
  detection_id TEXT PRIMARY KEY CHECK (length(detection_id) BETWEEN 1 AND 100),
  session_id TEXT NOT NULL REFERENCES game_detection_sessions(session_id) ON DELETE CASCADE,
  previous_game_id TEXT CHECK (
    previous_game_id IS NULL
    OR (length(previous_game_id) BETWEEN 1 AND 100 AND previous_game_id NOT GLOB '*[^a-z0-9-]*')
  ),
  game_id TEXT NOT NULL CHECK (
    length(game_id) BETWEEN 1 AND 100 AND game_id NOT GLOB '*[^a-z0-9-]*'
  ),
  confidence TEXT NOT NULL CHECK (confidence IN ('plausible', 'strong', 'distinctive')),
  candidate_signature TEXT NOT NULL CHECK (length(candidate_signature) = 64),
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  detected_at INTEGER NOT NULL CHECK (detected_at >= 0),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 100),
  prompt_revision TEXT NOT NULL CHECK (length(prompt_revision) BETWEEN 1 AND 100),
  announcement_state TEXT NOT NULL CHECK (
    announcement_state IN ('pending', 'processing', 'sent', 'failed')
  ),
  announcement_attempts INTEGER NOT NULL DEFAULT 0 CHECK (
    announcement_attempts BETWEEN 0 AND 3
  ),
  next_announcement_at INTEGER NOT NULL CHECK (
    next_announcement_at >= detected_at
  ),
  announcement_started_at INTEGER CHECK (
    announcement_started_at IS NULL OR announcement_started_at >= detected_at
  ),
  announcement_completed_at INTEGER CHECK (
    announcement_completed_at IS NULL OR announcement_completed_at >= detected_at
  ),
  discord_message_id TEXT CHECK (
    discord_message_id IS NULL OR length(discord_message_id) BETWEEN 1 AND 32
  ),
  announcement_failure TEXT CHECK (
    announcement_failure IS NULL OR length(announcement_failure) BETWEEN 1 AND 100
  ),
  CHECK (
    (announcement_state = 'pending' AND announcement_attempts BETWEEN 0 AND 2 AND announcement_started_at IS NULL AND announcement_completed_at IS NULL AND discord_message_id IS NULL AND announcement_failure IS NULL)
    OR (announcement_state = 'processing' AND announcement_attempts BETWEEN 1 AND 3 AND announcement_started_at IS NOT NULL AND announcement_completed_at IS NULL AND discord_message_id IS NULL AND announcement_failure IS NULL)
    OR (announcement_state = 'sent' AND announcement_attempts BETWEEN 1 AND 3 AND announcement_started_at IS NOT NULL AND announcement_completed_at IS NOT NULL AND discord_message_id IS NOT NULL AND announcement_failure IS NULL)
    OR (announcement_state = 'failed' AND announcement_attempts BETWEEN 1 AND 3 AND announcement_started_at IS NOT NULL AND announcement_completed_at IS NOT NULL AND discord_message_id IS NULL AND announcement_failure IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX game_detections_session_signature
  ON game_detections(session_id, candidate_signature);
CREATE INDEX game_detections_pending_announcement
  ON game_detections(announcement_state, detected_at);

CREATE VIEW game_detection_titled_rolls_90d AS
SELECT observed.interaction_id,
       observed.session_id,
       observed.observed_at,
       observed.classification,
       observed.game_id,
       receipt.command_name,
       receipt.scope,
       json_extract(receipt.context_json, '$.title') AS title,
       json_extract(receipt.context_json, '$.guildName') AS guild_name,
       json_extract(receipt.context_json, '$.channelName') AS channel_name,
       json_extract(receipt.context_json, '$.notation') AS notation
FROM game_detection_rolls AS observed
JOIN roll_lifecycle_receipts AS receipt
  ON receipt.interaction_id = observed.interaction_id
WHERE observed.has_title = 1;

CREATE TABLE game_detection_daily_aggregates (
  day TEXT NOT NULL CHECK (
    length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  classification TEXT NOT NULL CHECK (
    classification IN ('in-game', 'unknown', 'out-of-game')
  ),
  game_id_key TEXT NOT NULL CHECK (
    game_id_key = ''
    OR (length(game_id_key) BETWEEN 1 AND 100 AND game_id_key NOT GLOB '*[^a-z0-9-]*')
  ),
  roll_count INTEGER NOT NULL CHECK (roll_count >= 0),
  titled_roll_count INTEGER NOT NULL CHECK (
    titled_roll_count >= 0 AND titled_roll_count <= roll_count
  ),
  PRIMARY KEY (day, classification, game_id_key),
  CHECK (
    (classification = 'in-game' AND game_id_key != '')
    OR (classification != 'in-game' AND game_id_key = '')
  )
) STRICT;
