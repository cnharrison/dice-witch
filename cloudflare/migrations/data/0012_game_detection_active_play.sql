ALTER TABLE game_detection_control
  ADD COLUMN active_play_started_at INTEGER
  CHECK (active_play_started_at IS NULL OR active_play_started_at >= 0);

UPDATE game_detection_control
SET active_play_started_at = unixepoch() * 1000,
    started_at = 9007199254740991
WHERE singleton = 1;

ALTER TABLE game_detection_sessions
  ADD COLUMN active_play_state TEXT NOT NULL DEFAULT 'isolated'
  CHECK (active_play_state IN ('isolated', 'possible', 'active', 'inactive'));

ALTER TABLE game_detection_sessions
  ADD COLUMN active_play_path TEXT
  CHECK (active_play_path IS NULL OR active_play_path IN ('multiplayer', 'solo', 'sustained'));

ALTER TABLE game_detection_sessions
  ADD COLUMN active_episode_started_at INTEGER
  CHECK (active_episode_started_at IS NULL OR active_episode_started_at >= 0);

ALTER TABLE game_detection_sessions
  ADD COLUMN active_play_updated_at INTEGER
  CHECK (active_play_updated_at IS NULL OR active_play_updated_at >= 0);

ALTER TABLE game_detection_sessions
  ADD COLUMN active_play_policy_revision TEXT NOT NULL DEFAULT 'active-play:v1'
  CHECK (active_play_policy_revision = 'active-play:v1');

ALTER TABLE game_detection_rank_jobs
  ADD COLUMN active_episode_started_at INTEGER
  CHECK (active_episode_started_at IS NULL OR active_episode_started_at >= 0);

ALTER TABLE game_detections
  ADD COLUMN active_episode_started_at INTEGER
  CHECK (active_episode_started_at IS NULL OR active_episode_started_at >= 0);

UPDATE game_detection_sessions
SET current_game_id = NULL,
    current_confidence = NULL,
    current_game_detected_at = NULL,
    last_candidate_signature = NULL,
    last_candidate_disposition = NULL,
    active_play_state = 'isolated',
    active_play_path = NULL,
    active_episode_started_at = NULL,
    active_play_updated_at = (
      SELECT active_play_started_at
      FROM game_detection_control
      WHERE singleton = 1
    ),
    active_play_policy_revision = 'active-play:v1';

UPDATE game_detection_rolls
SET classification = 'unknown', game_id = NULL
WHERE classification = 'pending';

UPDATE game_detection_rank_jobs
SET state = 'completed',
    attempt_count = 1,
    started_at = created_at,
    completed_at = MAX(
      created_at,
      (SELECT active_play_started_at FROM game_detection_control WHERE singleton = 1)
    ),
    result = 'failed',
    detail = 'active-play-policy-upgraded',
    latency_ms = 0
WHERE state = 'pending';

UPDATE game_detection_rank_jobs
SET state = 'completed',
    completed_at = MAX(
      started_at,
      (SELECT active_play_started_at FROM game_detection_control WHERE singleton = 1)
    ),
    result = 'failed',
    detail = 'active-play-policy-upgraded',
    latency_ms = MAX(
      0,
      (SELECT active_play_started_at FROM game_detection_control WHERE singleton = 1) - started_at
    )
WHERE state = 'processing';

UPDATE game_detections
SET announcement_state = 'failed',
    announcement_attempts = MAX(1, announcement_attempts),
    announcement_started_at = detected_at,
    announcement_completed_at = MAX(
      detected_at,
      (SELECT active_play_started_at FROM game_detection_control WHERE singleton = 1)
    ),
    discord_message_id = NULL,
    announcement_failure = 'active-play-policy-upgraded'
WHERE announcement_state = 'pending';

UPDATE game_detections
SET announcement_state = 'failed',
    announcement_completed_at = MAX(
      announcement_started_at,
      (SELECT active_play_started_at FROM game_detection_control WHERE singleton = 1)
    ),
    discord_message_id = NULL,
    announcement_failure = 'active-play-policy-upgraded'
WHERE announcement_state = 'processing';

CREATE INDEX game_detection_sessions_active_play
  ON game_detection_sessions(active_play_state, state, active_play_updated_at);
