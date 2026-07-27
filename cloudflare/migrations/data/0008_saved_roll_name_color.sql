ALTER TABLE saved_rolls
ADD COLUMN name_color TEXT
CHECK (
  name_color IS NULL
  OR (
    length(name_color) = 7
    AND substr(name_color, 1, 1) = '#'
    AND substr(name_color, 2) NOT GLOB '*[^0-9A-F]*'
  )
);
