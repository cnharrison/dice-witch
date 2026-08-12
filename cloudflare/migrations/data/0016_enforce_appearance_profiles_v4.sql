UPDATE user_appearance_profiles
SET profile_json = json_set(
  profile_json,
  '$.version', 4,
  '$.diceView', json(
    '{"elevationDegrees":40,"mode":"normal","azimuth":{"all":{"mode":"random","customDegrees":0},"overrides":{}}}'
  )
)
WHERE json_extract(profile_json, '$.version') = 3;

UPDATE guild_appearance_profiles
SET profile_json = json_set(
  profile_json,
  '$.version', 4,
  '$.diceView', json(
    '{"elevationDegrees":40,"mode":"normal","azimuth":{"all":{"mode":"random","customDegrees":0},"overrides":{}}}'
  )
)
WHERE json_extract(profile_json, '$.version') = 3;

CREATE TRIGGER user_appearance_profiles_v4_insert
BEFORE INSERT ON user_appearance_profiles
WHEN COALESCE(
  json_type(NEW.profile_json, '$.version') != 'integer'
    OR json_extract(NEW.profile_json, '$.version') != 4,
  1
)
BEGIN
  SELECT RAISE(ABORT, 'Appearance profiles must use version 4');
END;

CREATE TRIGGER user_appearance_profiles_v4_update
BEFORE UPDATE OF profile_json ON user_appearance_profiles
WHEN COALESCE(
  json_type(NEW.profile_json, '$.version') != 'integer'
    OR json_extract(NEW.profile_json, '$.version') != 4,
  1
)
BEGIN
  SELECT RAISE(ABORT, 'Appearance profiles must use version 4');
END;

CREATE TRIGGER guild_appearance_profiles_v4_insert
BEFORE INSERT ON guild_appearance_profiles
WHEN COALESCE(
  json_type(NEW.profile_json, '$.version') != 'integer'
    OR json_extract(NEW.profile_json, '$.version') != 4,
  1
)
BEGIN
  SELECT RAISE(ABORT, 'Appearance profiles must use version 4');
END;

CREATE TRIGGER guild_appearance_profiles_v4_update
BEFORE UPDATE OF profile_json ON guild_appearance_profiles
WHEN COALESCE(
  json_type(NEW.profile_json, '$.version') != 'integer'
    OR json_extract(NEW.profile_json, '$.version') != 4,
  1
)
BEGIN
  SELECT RAISE(ABORT, 'Appearance profiles must use version 4');
END;

UPDATE user_appearance_profiles SET profile_json = profile_json;
UPDATE guild_appearance_profiles SET profile_json = profile_json;
