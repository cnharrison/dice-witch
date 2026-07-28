# Troubleshooting

Start with the symptom you can see. Change permissions only in the affected channel or category.

## Discord does not offer `/roll`

Check the channel:

1. You need **View Channel**, **Send Messages**, and **Use Application Commands**.
2. Dice Witch needs **View Channel** and **Send Messages**.
3. Channel and category overrides may change inherited permissions.
4. Reopen Discord's command picker before changing permissions.

A server may intentionally limit Dice Witch to specific channels. Ask an administrator where rolling is allowed.

## A server or channel is missing from the Roller

Servers and channels appear in the Roller only when all of these are true:

- You are still a member of the server.
- You can access the channel and have permission to send messages and use Dice Witch's slash commands there.
- Dice Witch can access the channel and has permission to post messages there.

Current members can use available Server Library rolls. Only Administrators and Dice Witch Admins can manage them.

## The notation is rejected

Open [Dice notation](/docs/dice-notation#fix-an-invalid-roll), then:

1. Try the dice alone.
2. Add arithmetic and modifiers one at a time.
3. Check required values such as `k2`, `r<=3`, and `cs=20`.
4. Make sure each modifier has a possible stopping result:
   - A reroll or explosion condition must not match every face. `d6r>=1` and `d6!>=1` can never stop.
   - A unique roll cannot request more results than the die has faces. `7d6u` cannot make seven unique d6 results.

Dice Witch rejects rolls that could continue forever instead of guessing how to resolve them.

## Appearance changes are missing

1. Confirm the design was saved and applied to the intended die type.
2. Check whether that type inherits **All dice** or has an override.
3. Check whether an **Enforced** server design overrides personal designs.
4. Prepare a new roll after changing Preferences.
