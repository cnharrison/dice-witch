-- Materialize the anti-join, not the policy cutoff: old receipts can become
-- eligible after delivery or a change to active_play_started_at.
ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN game_detection_pending INTEGER NOT NULL DEFAULT 0
    CHECK (game_detection_pending IN (0, 1));

CREATE TRIGGER game_detection_receipt_insert
AFTER INSERT ON roll_lifecycle_receipts
WHEN NEW.state = 'delivered'
  AND NOT EXISTS (
    SELECT 1 FROM game_detection_rolls WHERE interaction_id = NEW.interaction_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM game_detection_skipped_receipts WHERE interaction_id = NEW.interaction_id
  )
BEGIN
  UPDATE roll_lifecycle_receipts SET game_detection_pending = 1
  WHERE interaction_id = NEW.interaction_id;
END;

CREATE TRIGGER game_detection_receipt_state
AFTER UPDATE OF state ON roll_lifecycle_receipts
WHEN NEW.state != OLD.state
  AND (NEW.state = 'delivered' OR OLD.state = 'delivered')
BEGIN
  UPDATE roll_lifecycle_receipts
  SET game_detection_pending = (
    NEW.state = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM game_detection_rolls WHERE interaction_id = NEW.interaction_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM game_detection_skipped_receipts WHERE interaction_id = NEW.interaction_id
    )
  )
  WHERE interaction_id = NEW.interaction_id;
END;

CREATE TRIGGER game_detection_observed_insert
AFTER INSERT ON game_detection_rolls
BEGIN
  UPDATE roll_lifecycle_receipts SET game_detection_pending = 0
  WHERE interaction_id = NEW.interaction_id AND game_detection_pending = 1;
END;

CREATE TRIGGER game_detection_skipped_insert
AFTER INSERT ON game_detection_skipped_receipts
BEGIN
  UPDATE roll_lifecycle_receipts SET game_detection_pending = 0
  WHERE interaction_id = NEW.interaction_id AND game_detection_pending = 1;
END;

-- Preserve eligibility if a deduplication record is removed, including during
-- retention. The remaining exclusion still applies.
CREATE TRIGGER game_detection_observed_delete
AFTER DELETE ON game_detection_rolls
BEGIN
  UPDATE roll_lifecycle_receipts SET game_detection_pending = 1
  WHERE interaction_id = OLD.interaction_id AND state = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM game_detection_skipped_receipts WHERE interaction_id = OLD.interaction_id
    );
END;

CREATE TRIGGER game_detection_skipped_delete
AFTER DELETE ON game_detection_skipped_receipts
BEGIN
  UPDATE roll_lifecycle_receipts SET game_detection_pending = 1
  WHERE interaction_id = OLD.interaction_id AND state = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM game_detection_rolls WHERE interaction_id = OLD.interaction_id
    );
END;

-- Only pending receipts are rewritten; processed history retains the default.
UPDATE roll_lifecycle_receipts
SET game_detection_pending = 1
WHERE state = 'delivered'
  AND NOT EXISTS (
    SELECT 1 FROM game_detection_rolls AS observed
    WHERE observed.interaction_id = roll_lifecycle_receipts.interaction_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM game_detection_skipped_receipts AS skipped
    WHERE skipped.interaction_id = roll_lifecycle_receipts.interaction_id
  );

CREATE INDEX idx_game_detection_pending_receipts
  ON roll_lifecycle_receipts(received_at, interaction_id)
  WHERE game_detection_pending = 1;

CREATE INDEX idx_roll_lifecycle_alert_candidates
  ON roll_lifecycle_receipts(deferred_at, interaction_id)
  WHERE state != 'delivered'
    AND alert_state IN ('none', 'sending', 'failed')
    AND alert_message_id IS NULL;

CREATE INDEX game_detection_sessions_channel_time
  ON game_detection_sessions(channel_id, started_at);
