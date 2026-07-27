CREATE TABLE saved_roll_order_backfill (
  id TEXT PRIMARY KEY,
  manual_order INTEGER NOT NULL CHECK (manual_order >= 0)
) STRICT;

INSERT INTO saved_roll_order_backfill (id, manual_order)
SELECT
  id,
  ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY pinned DESC, manual_order, id
  ) - 1
FROM saved_rolls
WHERE user_id IS NOT NULL;

INSERT INTO saved_roll_order_backfill (id, manual_order)
SELECT
  id,
  ROW_NUMBER() OVER (
    PARTITION BY guild_id
    ORDER BY pinned DESC, manual_order, id
  ) - 1
FROM saved_rolls
WHERE guild_id IS NOT NULL;

UPDATE saved_rolls
SET manual_order = manual_order + 1000;

UPDATE saved_rolls
SET
  manual_order = (
    SELECT manual_order
    FROM saved_roll_order_backfill
    WHERE saved_roll_order_backfill.id = saved_rolls.id
  ),
  pinned = 0;

UPDATE user_saved_roll_lists
SET revision = revision + 1,
    updated_at = unixepoch() * 1000;

UPDATE guild_saved_roll_lists
SET revision = revision + 1,
    updated_at = unixepoch() * 1000;

DROP TABLE saved_roll_order_backfill;

CREATE TRIGGER saved_rolls_disable_pinning_after_insert
AFTER INSERT ON saved_rolls
WHEN NEW.pinned <> 0
BEGIN
  UPDATE saved_rolls SET pinned = 0 WHERE id = NEW.id;
END;

CREATE TRIGGER saved_rolls_disable_pinning_after_update
AFTER UPDATE OF pinned ON saved_rolls
WHEN NEW.pinned <> 0
BEGIN
  UPDATE saved_rolls SET pinned = 0 WHERE id = NEW.id;
END;
