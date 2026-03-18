# 🎃 Pumpkin Spice Dice

A Discord dice bot customized for **Pumpkin Spice: A Magical Cozy RPG** by [Acheron Games](https://acherongames.com).

Based on [Dice Witch](https://github.com/cnharrison/dice-witch) by cnharrison — a visual TTRPG dice roller for Discord.

---

## What's different

This fork modifies Dice Witch for the Pumpkin Spice system:

- **d6 only** — all rolls use six-sided dice
- **Essence mapping** — die faces show Essence symbols instead of numbers:

| Roll | Essence        |
|------|--------------- |
| 1    | 🧙‍♀️ Authority   |
| 2    | 🌿 Nature      |
| 3    | ☕ Empathy     |
| 4    | 🐈‍⬛ Stillness   |
| 5    | 🔮 Imagination |
| 6    | 📖 Wisdom      |

- **Shortcut notation** — type `/roll 3` instead of `/roll 3d6`
- Numeric totals hidden — Essences don't add up to a number

---
# Install

You can install Dice Witch on your Discord server by clicking [here](https://discord.com/oauth2/authorize?client_id=1483805124852846602&permissions=2147584000&integration_type=0&scope=bot+applications.commands).

# Usage
```
/roll 3       → rolls 3d6, shows Essences
/roll 3d6     → same thing
```

---

# Setup

## Installation

This bot is a private instance running for a specific campaign.
If you'd like to run your own instance for your Pumpkin Spice game,
clone this repo and follow the setup instructions in the original
[Dice Witch repository](https://github.com/cnharrison/dice-witch).

## Requires:
- Discord bot token
- PostgreSQL database
- Node.js / Bun runtime

---

# Credits

Built on [Dice Witch](https://github.com/cnharrison/dice-witch) by cnharrison.  
Made for [Pumpkin Spice: A Magical Cozy RPG](https://acherongames.com) by Acheron Games.