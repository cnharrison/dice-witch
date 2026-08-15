CREATE TABLE appearance_font_r37_migration_guard (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;

INSERT INTO appearance_font_r37_migration_guard (valid)
SELECT 0
FROM (
  SELECT profile_json FROM user_appearance_profiles
  UNION ALL
  SELECT profile_json FROM guild_appearance_profiles
) AS profiles
WHERE
  json_type(profile_json, '$.version') IS NOT 'integer'
  OR json_extract(profile_json, '$.version') IS NOT 4
  OR json_type(profile_json, '$.designs') IS NOT 'array'
  OR EXISTS (
    SELECT 1
    FROM json_each(profile_json, '$.designs') AS designs
    WHERE
      json_type(designs.value, '$.recipe.font') IS NOT 'object'
      OR json_type(designs.value, '$.recipe.font.mode') IS NOT 'text'
      OR json_extract(designs.value, '$.recipe.font.mode') NOT IN (
        'fixed',
        'allowlist',
        'weighted'
      )
      OR (
        json_extract(designs.value, '$.recipe.font.mode') = 'fixed'
        AND json_type(designs.value, '$.recipe.font.value') IS NOT 'text'
      )
      OR (
        json_extract(designs.value, '$.recipe.font.mode') = 'allowlist'
        AND (
          json_type(designs.value, '$.recipe.font.values') IS NOT 'array'
          OR json_array_length(designs.value, '$.recipe.font.values') < 1
          OR EXISTS (
            SELECT 1
            FROM json_each(
              designs.value,
              '$.recipe.font.values'
            ) AS values_to_validate
            WHERE values_to_validate.type != 'text'
          )
        )
      )
      OR (
        json_extract(designs.value, '$.recipe.font.mode') = 'weighted'
        AND (
          json_type(designs.value, '$.recipe.font.options') IS NOT 'array'
          OR json_array_length(designs.value, '$.recipe.font.options') < 1
          OR EXISTS (
            SELECT 1
            FROM json_each(
              designs.value,
              '$.recipe.font.options'
            ) AS options_to_validate
            WHERE
              options_to_validate.type != 'object'
              OR json_type(options_to_validate.value, '$.value') IS NOT 'text'
              OR json_type(options_to_validate.value, '$.weight') IS NOT 'integer'
          )
        )
      )
  )
LIMIT 1;

INSERT INTO appearance_font_r37_migration_guard (valid)
SELECT 0
FROM (
  SELECT profile_json FROM user_appearance_profiles
  UNION ALL
  SELECT profile_json FROM guild_appearance_profiles
) AS profiles
JOIN json_each(profile_json, '$.designs') AS designs
WHERE (
  json_extract(designs.value, '$.recipe.font.mode') = 'allowlist'
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT CASE values_to_map.value
        WHEN 'liberation-sans' THEN 'barlow-condensed'
        WHEN 'barlow-condensed' THEN 'jetbrains-mono'
        ELSE values_to_map.value
      END AS mapped_value
      FROM json_each(
        designs.value,
        '$.recipe.font.values'
      ) AS values_to_map
    )
    GROUP BY mapped_value
    HAVING count(*) > 1
  )
) OR (
  json_extract(designs.value, '$.recipe.font.mode') = 'weighted'
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT CASE json_extract(options_to_map.value, '$.value')
        WHEN 'liberation-sans' THEN 'barlow-condensed'
        WHEN 'barlow-condensed' THEN 'jetbrains-mono'
        ELSE json_extract(options_to_map.value, '$.value')
      END AS mapped_value
      FROM json_each(
        designs.value,
        '$.recipe.font.options'
      ) AS options_to_map
    )
    GROUP BY mapped_value
    HAVING count(*) > 1
  )
)
LIMIT 1;

CREATE TABLE appearance_font_r37_migration (
  profile_kind TEXT NOT NULL CHECK (profile_kind IN ('user', 'guild')),
  profile_key TEXT NOT NULL,
  original_json TEXT NOT NULL CHECK (json_valid(original_json)),
  migrated_json TEXT CHECK (migrated_json IS NULL OR json_valid(migrated_json)),
  PRIMARY KEY (profile_kind, profile_key)
) STRICT;

INSERT INTO appearance_font_r37_migration (
  profile_kind,
  profile_key,
  original_json
)
SELECT 'user', user_id, profile_json
FROM user_appearance_profiles
WHERE EXISTS (
  SELECT 1
  FROM json_each(profile_json, '$.designs') AS designs
  WHERE (
    json_extract(designs.value, '$.recipe.font.mode') = 'fixed'
    AND json_extract(designs.value, '$.recipe.font.value') = 'liberation-sans'
  ) OR (
    json_extract(designs.value, '$.recipe.font.mode') = 'allowlist'
    AND EXISTS (
      SELECT 1
      FROM json_each(designs.value, '$.recipe.font.values') AS values_to_match
      WHERE values_to_match.value IN ('liberation-sans', 'barlow-condensed')
    )
  ) OR (
    json_extract(designs.value, '$.recipe.font.mode') = 'weighted'
    AND EXISTS (
      SELECT 1
      FROM json_each(designs.value, '$.recipe.font.options') AS options_to_match
      WHERE json_extract(options_to_match.value, '$.value') IN (
        'liberation-sans',
        'barlow-condensed'
      )
    )
  )
);

INSERT INTO appearance_font_r37_migration (
  profile_kind,
  profile_key,
  original_json
)
SELECT 'guild', guild_id, profile_json
FROM guild_appearance_profiles
WHERE EXISTS (
  SELECT 1
  FROM json_each(profile_json, '$.designs') AS designs
  WHERE (
    json_extract(designs.value, '$.recipe.font.mode') = 'fixed'
    AND json_extract(designs.value, '$.recipe.font.value') = 'liberation-sans'
  ) OR (
    json_extract(designs.value, '$.recipe.font.mode') = 'allowlist'
    AND EXISTS (
      SELECT 1
      FROM json_each(designs.value, '$.recipe.font.values') AS values_to_match
      WHERE values_to_match.value IN ('liberation-sans', 'barlow-condensed')
    )
  ) OR (
    json_extract(designs.value, '$.recipe.font.mode') = 'weighted'
    AND EXISTS (
      SELECT 1
      FROM json_each(designs.value, '$.recipe.font.options') AS options_to_match
      WHERE json_extract(options_to_match.value, '$.value') IN (
        'liberation-sans',
        'barlow-condensed'
      )
    )
  )
);

UPDATE appearance_font_r37_migration
SET migrated_json = json_set(
  original_json,
  '$.designs',
  json((
    SELECT json_group_array(json(migrated_designs.design_json))
    FROM (
      SELECT CASE json_extract(designs.value, '$.recipe.font.mode')
        WHEN 'fixed' THEN
          CASE json_extract(designs.value, '$.recipe.font.value')
            WHEN 'liberation-sans' THEN json_set(
              designs.value,
              '$.recipe.font.value',
              'barlow-condensed'
            )
            ELSE designs.value
          END
        WHEN 'allowlist' THEN json_set(
          designs.value,
          '$.recipe.font.values',
          json((
            SELECT json_group_array(mapped_values.mapped_value)
            FROM (
              SELECT CASE values_to_map.value
                WHEN 'liberation-sans' THEN 'barlow-condensed'
                WHEN 'barlow-condensed' THEN 'jetbrains-mono'
                ELSE values_to_map.value
              END AS mapped_value
              FROM json_each(
                designs.value,
                '$.recipe.font.values'
              ) AS values_to_map
              ORDER BY CAST(values_to_map.key AS INTEGER)
            ) AS mapped_values
          ))
        )
        WHEN 'weighted' THEN json_set(
          designs.value,
          '$.recipe.font.options',
          json((
            SELECT json_group_array(json(mapped_options.option_json))
            FROM (
              SELECT json_set(
                options_to_map.value,
                '$.value',
                CASE json_extract(options_to_map.value, '$.value')
                  WHEN 'liberation-sans' THEN 'barlow-condensed'
                  WHEN 'barlow-condensed' THEN 'jetbrains-mono'
                  ELSE json_extract(options_to_map.value, '$.value')
                END
              ) AS option_json
              FROM json_each(
                designs.value,
                '$.recipe.font.options'
              ) AS options_to_map
              ORDER BY CAST(options_to_map.key AS INTEGER)
            ) AS mapped_options
          ))
        )
      END AS design_json
      FROM json_each(original_json, '$.designs') AS designs
      ORDER BY CAST(designs.key AS INTEGER)
    ) AS migrated_designs
  ))
);

INSERT INTO appearance_font_r37_migration_guard (valid)
SELECT 0
FROM appearance_font_r37_migration
WHERE
  migrated_json IS NULL
  OR json_type(migrated_json) IS NOT 'object'
  OR json_extract(migrated_json, '$.version') IS NOT 4
  OR EXISTS (
    SELECT 1
    FROM json_each(migrated_json, '$.designs') AS designs
    WHERE (
      json_extract(designs.value, '$.recipe.font.mode') = 'fixed'
      AND json_extract(designs.value, '$.recipe.font.value') = 'liberation-sans'
    ) OR (
      json_extract(designs.value, '$.recipe.font.mode') = 'allowlist'
      AND EXISTS (
        SELECT 1
        FROM json_each(designs.value, '$.recipe.font.values') AS values_to_check
        WHERE values_to_check.value = 'liberation-sans'
      )
    ) OR (
      json_extract(designs.value, '$.recipe.font.mode') = 'weighted'
      AND EXISTS (
        SELECT 1
        FROM json_each(designs.value, '$.recipe.font.options') AS options_to_check
        WHERE json_extract(options_to_check.value, '$.value') = 'liberation-sans'
      )
    )
  )
LIMIT 1;

UPDATE user_appearance_profiles
SET profile_json = (
  SELECT migrated_json
  FROM appearance_font_r37_migration
  WHERE
    profile_kind = 'user'
    AND profile_key = user_appearance_profiles.user_id
)
WHERE EXISTS (
  SELECT 1
  FROM appearance_font_r37_migration
  WHERE
    profile_kind = 'user'
    AND profile_key = user_appearance_profiles.user_id
    AND original_json = user_appearance_profiles.profile_json
);

UPDATE guild_appearance_profiles
SET profile_json = (
  SELECT migrated_json
  FROM appearance_font_r37_migration
  WHERE
    profile_kind = 'guild'
    AND profile_key = guild_appearance_profiles.guild_id
)
WHERE EXISTS (
  SELECT 1
  FROM appearance_font_r37_migration
  WHERE
    profile_kind = 'guild'
    AND profile_key = guild_appearance_profiles.guild_id
    AND original_json = guild_appearance_profiles.profile_json
);

INSERT INTO appearance_font_r37_migration_guard (valid)
SELECT 0
FROM appearance_font_r37_migration AS migration
WHERE NOT EXISTS (
  SELECT 1
  FROM user_appearance_profiles
  WHERE
    migration.profile_kind = 'user'
    AND user_id = migration.profile_key
    AND profile_json = migration.migrated_json
)
AND NOT EXISTS (
  SELECT 1
  FROM guild_appearance_profiles
  WHERE
    migration.profile_kind = 'guild'
    AND guild_id = migration.profile_key
    AND profile_json = migration.migrated_json
)
LIMIT 1;

DROP TABLE appearance_font_r37_migration;
DROP TABLE appearance_font_r37_migration_guard;
