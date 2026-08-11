ALTER TABLE guilds
ADD COLUMN hide_roll_result_text INTEGER NOT NULL DEFAULT 0
  CHECK (hide_roll_result_text IN (0, 1));
