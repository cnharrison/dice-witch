# Dice Witch roll render model

Converts a persisted `RollExecutionResult` plus its persisted render seed into the validated input accepted by `dice-svg`. The same outcome and render seed reproduce all faces, icons, colors, text contrast, and gradient/pattern choices.

Behavior retained from the current renderer:

- modifier icons use the existing ordering;
- penetrating explosions suppress the normal explosion icon;
- critical-success and critical-failure dice use the existing gold and red colors;
- patterns are selected for 40% of dice;
- more than three simultaneous modifier icons render no icons because the current layout has no valid spacing for that case;
- compound Fudge totals outside `-1..1` render the same blank overflow face while the authoritative numeric outcome remains persisted separately.

This package produces data only. PNG rasterization remains in `dice-svg`, outside the Gateway heartbeat isolate.
