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
