# Modifiers

Place modifiers directly after the dice they affect. In `4d10k2+3`, `k2` keeps two d10s before adding 3.

## Keep and drop

| Modifier | Example | Result |
| --- | --- | --- |
| `k` or `kh` | `4d10k2` | Keep the highest two. |
| `kl` | `4d10kl2` | Keep the lowest two. |
| `d` or `dl` | `4d10d1` | Drop the lowest one. |
| `dh` | `4d10dh1` | Drop the highest one. |

Advantage: `2d20k1`. Disadvantage: `2d20kl1`.

## Exploding dice

| Modifier | Example | Result |
| --- | --- | --- |
| `!` | `2d6!` | Roll another d6 for each 6. |
| `!` with comparison | `2d6!=5` | Roll another d6 for each 5. |
| Compounding `!!` | `2d6!!=5` | Add extra rolls to the original die's result. |
| Penetrating `!p` | `2d6!p=5` | Subtract 1 from each extra roll. |
| Compound and penetrate `!!p` | `2d6!!p=5` | Combine both behaviors. |

Without a comparison, a die explodes on its highest value. Dice Witch rejects conditions that cannot finish safely or would exceed its limits.

## Reroll and unique

| Modifier | Example | Result |
| --- | --- | --- |
| `r` | `4d10r<=3` | Reroll 3 or less until it no longer matches. |
| `ro` | `4d10ro<=3` | Reroll 3 or less once. |
| `u` | `4d6u` | Reroll duplicates until every result is unique. |
| `u` with comparison | `4d6u=5` | Reroll duplicate fives only. |
| `uo` | `4d6uo` | Reroll each duplicate once. |

Both `u` and `uo` can use a comparison. A unique roll needs enough possible faces for the requested number of unique results.

## Count successes and failures

A comparison directly after the dice counts matching results.

| Notation | Counts |
| --- | --- |
| `6d10>=7` | 7 or higher as successes |
| `6d10<=4` | 4 or lower as successes |
| `2d6=6` | Exactly 6 as successes |
| `6d10>=7f=1` | 7 or higher as successes and 1 as failures |

Use `=`, `>`, `<`, `>=`, or `<=`. Add `f` before a second comparison to count failures.

## Minimum, maximum, and sorting

| Modifier | Example | Result |
| --- | --- | --- |
| `min` | `4d6min3` | Treat results below 3 as 3. |
| `max` | `4d10max5` | Treat results above 5 as 5. |
| `s` or `sa` | `4d6sa` | Sort lowest to highest. |
| `sd` | `4d6sd` | Sort highest to lowest. |

Combine minimum and maximum when needed: `10d20max15min5`.

## Critical highlights

Critical modifiers add a cosmetic illustration showing whether a die is critical. They do not change the total.

| Modifier | Example | Result |
| --- | --- | --- |
| `cs` | `1d20cs=20` | Mark a 20 as a critical success. |
| `cf` | `1d20cf=1` | Mark a 1 as a critical failure. |

Without a comparison, `cs` uses the die's highest value and `cf` uses its lowest. Comparisons can mark a wider range, such as `5d20cs>=16`.
