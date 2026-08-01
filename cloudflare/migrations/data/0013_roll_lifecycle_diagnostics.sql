ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN lifecycle_version INTEGER NOT NULL DEFAULT 1
    CHECK (lifecycle_version IN (1, 2));

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN handler_started_at INTEGER
    CHECK (handler_started_at IS NULL OR handler_started_at >= 0);

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN acknowledgement_prepared_at INTEGER
    CHECK (
      acknowledgement_prepared_at IS NULL
      OR acknowledgement_prepared_at >= 0
    );

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN acknowledgement_type INTEGER
    CHECK (acknowledgement_type IS NULL OR acknowledgement_type IN (4, 5, 6));

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN first_provider_attempt_at INTEGER
    CHECK (
      first_provider_attempt_at IS NULL
      OR first_provider_attempt_at >= 0
    );

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN clatter_succeeded_at INTEGER
    CHECK (clatter_succeeded_at IS NULL OR clatter_succeeded_at >= 0);

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN discord_error_code INTEGER
    CHECK (discord_error_code IS NULL OR discord_error_code >= 1);

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN discord_operation TEXT
    CHECK (
      discord_operation IS NULL
      OR discord_operation IN (
        'create-followup-clatter',
        'create-followup-result',
        'edit-followup-result',
        'edit-original-clatter',
        'edit-original-result'
      )
    );

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN original_response_message_id TEXT
    CHECK (
      original_response_message_id IS NULL
      OR (
        length(original_response_message_id) BETWEEN 17 AND 20
        AND original_response_message_id NOT GLOB '*[^0-9]*'
        AND substr(original_response_message_id, 1, 1) BETWEEN '1' AND '9'
      )
    );

ALTER TABLE roll_lifecycle_receipts
  ADD COLUMN original_response_probe TEXT
    CHECK (
      original_response_probe IS NULL
      OR original_response_probe IN (
        'exists', 'missing', 'inaccessible', 'probe-failed'
      )
    );
