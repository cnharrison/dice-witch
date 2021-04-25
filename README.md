<img src="https://i.imgur.com/v1Dog6h.jpeg" width="300">

# Dice Witch

Dice Witch is a highly advanced bot that rolls dice on Discord. It displays the dice visually, and aims to simulate the sensory user experience of rolling real dice. 

![Image of Dice Witch in action](https://i.imgur.com/8cEkaek.gif)

# Table of contents 
   * [Install](#install)
   * [Usage](#usage)
      * [Basic rolls](#basic-rolls)
      * [Advanced rolls](#advanced-rolls)
         * [Min/Max](#minmax)
         * [Exploding](#exploding)
            * [Compounding](#compounding)
            * [Penetrating](#penetrating)
         * [Re-roll](#re-roll)
         * [Keep/Drop AKA Advantage](#keepdrop-aka-advantage)
         * [Target success/failure AKA Dice pool](#target-successfailure-aka-dice-pool)
         * [Critical success/failure](#critical-successfailure)
         * [Sorting](#sorting)
      * [Math](#math)
      * [Extras](#extras)
         * [Repeating rolls](#repeating-rolls)
         * [Titled rolls](#titled-rolls)
   * [Contributing](#contributing)
   * [Support](#support)
   * [Credits](#credits)
   * [Roadmap](#roadmap)

# Install

You can install Dice Witch on your Discord server by clicking [here](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot).

# Usage


## Basic rolls
You can roll any of the traditional dice that exist IRL with Dice Witch--four, six, eight, ten, twelve, or twenty-sided dice.The reason for this restriction is that dice are displayed as images in Discord. 

  - `!roll 1d4 3d6 1d20`: Roll one four-sided die, three six-sided dice, and one twenty-sided die.
  - `!roll 1d12+3 5d4`: Roll one twelve-sided die, adding three to the total, and five four sided dice. 
  - `!roll 3d6+3d6`: Roll two sets of three six-sided dice and add the total. 


## Advanced rolls
You can use (almost) any of these modifiers in conjunction with any other modifiers. 

### Min/Max
Cause any rolls above/below the value to be treated as equal to the minimum/maximum value.
  - `!roll 4d6min3`: Roll four d6 where values less than three are treated as equal to three.
  - `!roll 4d10max5`: Roll four d10 where values greater than five are treated as equal to five.
  - `!roll 10d20max15min5`: Roll ten d20 where values greater than fifteen are treated as equal to fifteen, and values less than five are treated as equal to five.
​

### Exploding
Allows one or more dice to be re-rolled (Usually when it rolls the highest possible number on the die), with each successive roll being added to the total.
  - `!roll 2d6!=5`: Roll two d6 and explode on any roll equal to five.
  - `!roll 2d!>4`: Roll two d6 and explode on any roll greater than four. 
  - `!roll 4d10!<=3`: Roll four d10 and explode on any roll less than or equal to three. 

#### Compounding
Just like exploding, but exploded dice will be combined together in a single roll instead of being re-rolled. You can mark exploding dice to compound by using  `!!` instead of `!`
  - `!roll 2d6!!=5`: Roll two d6 and explode and compound on any roll equal to five.

#### Penetrating
A type of exploding dice most commonly used in the Hackmaster system. 
>Should you roll the maximum value on this particular die, you may re-roll and add the result of the extra die, less one point, to the total (penetration can actually result in simply the maximum die value if a 1 is subsequently rolled, since any fool knows that 1-1=0). This process continues indefinitely as long as the die in question continues to come up maximum (but there’s always only a –1 subtracted from the extra die, even if it’s, say, the third die of penetration)

You can mark exploding dice to penetrate by using `!p` instead of `!`. 
- `!roll 2d6!p=5`: Roll two d6 and explode and penetrate on any roll equal to five.


### Re-roll
Rerolls a die that rolls the lowest possible number on that die, until a number greater than the minimum is rolled. 

- `!roll 1d10r`: Roll 1d10 and reroll on one. 
- `!roll 4d10r<=3`: Roll 4d10 and reroll on any result less than or equal to three. 

### Keep/Drop AKA Advantage
Disregard or keep all dice above or below a certain threshold. 
- `!roll 4d10k2`: Roll 4d10 and keep the highest two rolls
- `!roll 4d10kl2`: Roll 4d10 and keep the lowest two rolls.  

- `!roll 4d10d1`: Roll 4d10 and disregard the lowest roll.
- `!roll 4d10dh1`: Roll 4d10 and disregard the highest roll.

### Target success/failure AKA Dice pool
Counts the number of dice that meet a criterion.
- `!roll 2d6=6`: Roll 2d6 and count the number of dice that equal six
- `!roll 6d10<=4`: Roll 6d10 and count the number of dice that are less than or equal to four

### Critical success/failure 
This is an aesthetic feature that makes it super clear when a die has rolled the highest or lowest possible value. It makes no difference to the roll or its value.

- `!roll 1d20cs=20`: Roll 1d20 and highlight if result is 20.
- `!roll 5d20cs>=16`: Roll 5d20 and highlight if result is greater than 16.
- `!roll 1d20cf=1`: Roll 1d20 and highlight result is 1.

### Sorting

Sorts the results of any of your rolls in ascending or descending numerical order. 

- `!roll 4d6`: Roll 4d6 and do not sort.
- `!roll 4d6s`: Roll 4d6 and sort results in ascending order.
- `!roll 4d6sa`: Same as above.
- `!roll 4d6sd`: Roll 4d6 and sort results in descending order.

## Math 

You can use add, subtract, multiply, divide, reduce, and use parentheses as you please. You can also use the following JS math functions: `abs, ceil, cos, exp, floor, log, max, min, pow, round, sign, sin, sqrt, tan`

- `!roll d6*5`: Roll a d6 and multiply the result by 5 
- `!roll 2d10/d20`: Roll 2d20 and add the result together, then roll a d20 and divide the two totals.
- `!roll 3d20^4`: Roll 3d20 and raise the result to the power of 4.
- `!roll (4-2)d10`: Subtract 2 from 4 and then roll a d10 that many times .
- `!roll sqrt(4d10/3)`: Roll 4d10, divide by three and calculate the square root.

## Extras 

### Repeating rolls

You can repeat any roll by inserting a `<times to repeat>` string anywhere in your notation.
  - `!roll <6> 1d20+5`: Roll 1d20+5 six times.
  - `!roll 3d20+3d6 <10>`: Roll 3d20 and 3d6 and add the results. Repeat ten times.",

### Titled rolls

  - `!titledroll 1d20`: Roll one twenty-sided die with a title. You'll be prompted for the title after typing the command, and the roll will only be performed once you've given it. Any `!roll` can also be a `!titledroll`. You have 30 seconds to answer the prompt.

# Contributing

PRs and forks are welcome! 🙂

# Support

If you find a bug, please open a Github Issue. You can also join the support Discord [here](https://discord.gg/BdyQG7hZZn).

# Credits 
Dice Witch uses the superb [RPG Dice Roller](https://github.com/GreenImp/rpg-dice-roller) library by Lee Langley AKA GreenImp. 


# Roadmap

- [ ] User and guild registration
  - [ ] Per user and per guild settings (e.g. prefix change)

- [ ] True random numbers based on stochastic atmospheric data
- [ ] A variety of different sets of illustrated and photographed dice


