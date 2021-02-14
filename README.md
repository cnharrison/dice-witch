<img src="https://i.imgur.com/v1Dog6h.jpeg" width="300">

# Dice Witch

Dice Witch is a simple bot that rolls dice on Discord. It displays the dice visually, and aims to simulate the sensory user experience of rolling real dice.

![Image of Dice Witch in action](https://i.imgur.com/yVYfpEa.gif)

# Install

You can install Dice Witch on your Discord server by clicking [here](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot).

# Usage

- Basic rolls
  - `!roll 1d4 3d6 1d20`: Roll one four-sided die, three six-sided dice, and one twenty-sided die.
  - `!roll 1d12+3 5d4`: Roll one twelve-sided die, adding three to the total, and five four sided dice. You can also subtract `-`, multiply `*`, and divide `/` rolls.
- Drop/keep dice AKA advantage rolls
  - `!roll 3d20b2`: Roll three twenty-sided dice and keep the best two
  - `!roll 5d8w1`: Roll five eight-sided dice and keep the worst one
- Titled rolls
  - `!roll 1d20 -t 'to flirt with the bartender'`: Roll one twenty-sided die and title it "to flirt with the bartender". You can add a title to any roll by placing a `-t '<your title here>'` flag anywhere within the command.

# Contributing

PRs are welcome! 🙂

# Support

If you find a bug, please open a Github Issue. You can also join the support Discord [here](https://discord.gg/7FT6VT5x).

# Roadmap

- Exploding Dice
- ~~Drop and keep dice~~ ✔
- True random numbers
- A variety of different sets of illustrated and photographed dice
