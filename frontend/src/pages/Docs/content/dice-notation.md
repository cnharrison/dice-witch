# Dice notation

Use `NdS`, where **N** is the number of dice and **S** is the number of sides. `2d6` rolls two six-sided dice. `d20` is shorthand for `1d20`.

## Dice

| Notation | Dice |
| --- | --- |
| `d4`, `d6`, `d8`, `d10`, `d12`, `d20` | Standard illustrated dice |
| `d%` | Percentile dice, from 1 to 100 |
| `dF` | Fate or Fudge dice: minus, blank, or plus |

Dice Witch can calculate other die sizes, but it uses a generic sphere illustration for them.

## Arithmetic and groups

| Operation | Example |
| --- | --- |
| Add | `2d6+3` |
| Subtract | `1d20-2` |
| Multiply | `d6*5` |
| Divide | `2d10/d20` |
| Power | `3d20^4` |
| Parentheses | `(4-2)d10` |
| Function | `sqrt(4d10/3)` |

Supported functions: `abs`, `ceil`, `cos`, `exp`, `floor`, `log`, `max`, `min`, `pow`, `round`, `sign`, `sin`, `sqrt`, and `tan`.

Use braces and commas to evaluate expressions together: `{1d20+5, 2d6+3}`.

## Common modifiers

Modifiers go directly after the dice they affect.

| Goal | Example |
| --- | --- |
| Keep or drop | `4d10k2`, `4d10d1` |
| Explode | `2d6!`, `2d6!!`, `2d6!p` |
| Reroll | `4d10r<=3`, `4d10ro<=3` |
| Unique results | `4d6u`, `4d6uo` |
| Count successes | `6d10>=7` |
| Minimum or maximum | `4d6min3`, `4d10max5` |
| Critical highlight | `1d20cs=20`, `1d20cf=1` |
| Sort | `4d6sa`, `4d6sd` |

See [Modifiers](/docs/modifiers) for every supported form.

## Fix an invalid roll

1. Try the dice alone, such as `2d6`.
2. Add arithmetic and modifiers one at a time.
3. Include required values: `k2`, `r<=3`, or `cs=20`.
4. Put grouped expressions inside braces and separate them with commas.
5. Keep the request within Dice Witch's dice and repetition limits.

A modifier affects only the dice immediately before it. In `2d20k1+1d6`, `k1` affects the d20s.
