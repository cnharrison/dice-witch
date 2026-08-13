ALTER TABLE oauth_states
ADD COLUMN purpose TEXT NOT NULL DEFAULT 'sign_in'
  CHECK (purpose IN ('sign_in', 'refresh'));

ALTER TABLE oauth_states
ADD COLUMN expected_user_id TEXT
  CHECK (
    expected_user_id IS NULL
    OR (
      length(expected_user_id) BETWEEN 17 AND 20
      AND expected_user_id NOT GLOB '*[^0-9]*'
      AND substr(expected_user_id, 1, 1) BETWEEN '1' AND '9'
    )
  );

ALTER TABLE oauth_states
ADD COLUMN return_to TEXT NOT NULL DEFAULT '/app'
  CHECK (length(return_to) BETWEEN 1 AND 2048);
