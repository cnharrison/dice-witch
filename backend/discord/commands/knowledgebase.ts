import {
  ButtonInteraction,
  ColorResolvable,
  CommandInteraction,
  EmbedBuilder
} from "discord.js";
import { CommandProps, KnowledgeBase } from "../../shared/types";
import { footerButtonRow, infoColor } from "../../core/constants/index";

const kb: KnowledgeBase = {
  minmax: [
    {
      name: "Min/Max",
      value:
        "Cause any rolls above/below the value to be treated as equal to the minimum/maximum value.\n\n`/roll notation:4d6min3`: Roll four d6 where values less than three are treated as equal to three.\n`/roll notation:4d10max5`: Roll four d10 where values greater than five are treated as equal to five.\n`/roll notation:10d20max15min5`: Roll ten d20 where values greater than fifteen are treated as equal to fifteen, and values less than five are treated as equal to five.",
      inline: false,
    },
  ],
  exploding: [
    {
      name: "Exploding dice",
      value:
        "Allows one or more dice to be re-rolled (Usually when it rolls the highest possible number on the die), with each successive roll being added to the total.\n\n`/roll notation:2d6!=5`: Roll two d6 and explode on any roll equal to five.\n`/roll notation:2d!>4`: Roll two d6 and explode on any roll greater than four.\n`/roll notation:4d10!<=3`: Roll four d10 and explode on any roll less than or equal to three.",
      inline: false,
    },
    {
      name: "Compounding",
      value:
        "Just like exploding, but exploded dice will be combined together in a single roll instead of being re-rolled. You can mark exploding dice to compound by using `!!` instead of `!`\n\n`/roll notation:F2d6!!=5`: Roll two d6 and explode and compound on any roll equal to five.",
      inline: false,
    },
    {
      name: "Penetrating",
      value:
        "A type of exploding dice most commonly used in the Hackmaster system. From the rules:\n`Should you roll the maximum value on this particular die, you may re-roll and add the result of the extra die, less one point, to the total (penetration can actually result in simply the maximum die value if a 1 is subsequently rolled, since any fool knows that 1-1=0). This process continues indefinitely as long as the die in question continues to come up maximum (but there's always only a –1 subtracted from the extra die, even if it's, say, the third die of penetration)`\n\nYou can mark exploding dice to penetrate by using `!p` instead of `!`.\n\n`/roll notation:2d6!p=5`: Roll two d6 and explode and penetrate on any roll equal to five.",
      inline: false,
    },
  ],
  unique: [
    {
      name: "Unique Dice",
      value:
        "Re-rolls duplicate dice values, ensuring all dice in the roll have unique values.\n\n`/roll notation:8d6u`: Roll eight d6 and reroll any duplicates.\n`/roll notation:8d6u=5`: Roll eight d6 and reroll only duplicates that equal 5.\n`/roll notation:10d10u>7`: Roll ten d10 and reroll only duplicates greater than 7.",
      inline: false,
    },
  ],
  reroll: [
    {
      name: "Re-roll",
      value:
        "Rerolls a die that rolls the lowest possible number on that die, until a number greater than the minimum is rolled.\n\n`/roll notation:1d10r`: Roll 1d10 and reroll on one.\n`/roll notation:4d10r<=3`: Roll 4d10 and reroll on any result less than or equal to three.",
      inline: false,
    },
  ],
  keepdrop: [
    {
      name: "Keep/Drop AKA Advantage",
      value:
        "Disregard or keep all dice above or below a certain threshold.\n\n`/roll notation:4d10k2`: Roll 4d10 and keep the highest two rolls.\n`/roll notation:4d10kl2`: Roll 4d10 and keep the lowest two rolls.\n`/roll notation:4d10d1`: Roll 4d10 and disregard the lowest roll.\n`/roll notation:4d10dh1`: Roll 4d10 and disregard the highest roll.",
      inline: false,
    },
  ],
  target: [
    {
      name: "Target success/failure AKA Dice pool",
      value:
        "Counts the number of dice that meet a criterion.\n\n`/roll notation:2d6=6`: Roll 2d6 and count the number of dice that equal six.\n`/roll notation:6d10<=4`: Roll 6d10 and count the number of dice that are less than or equal to four.",
      inline: false,
    },
  ],
  crit: [
    {
      name: "Critical success/failure",
      value:
        "This is an aesthetic feature that makes it super clear when a die has rolled the highest or lowest possible value. It makes no difference to the roll or its value.\n\n`/roll notation:1d20cs=20`: Roll 1d20 and highlight if result is 20.\n`/roll notation:5d20cs>=16`: Roll 5d20 and highlight if result is greater than 16.\n`/roll notation:1d20cf=1`: Roll 1d20 and highlight result is 1.",
      inline: false,
    },
  ],
  sort: [
    {
      name: "Sorting",
      value:
        "Sorts the results of any of your rolls in ascending or descending numerical order.\n\n`/roll notation:4d6`: Roll 4d6 and do not sort.\n`/roll notation:4d6s`: Roll 4d6 and sort results in ascending order.\n`/roll notation:4d6sa`: Same as above.\n`/roll notation:4d6sd`: Roll 4d6 and sort results in descending order.",
      inline: false,
    },
  ],
  math: [
    {
      name: "Math",
      value:
        "You can use add, subtract, multiply, divide, reduce, and parenthesis in most places inside dice notation. You can also use the following JS math functions: `abs, ceil, cos, exp, floor, log, max, min, pow, round, sign, sin, sqrt, tan`\n\n`/roll notation:d6*5`: Roll a d6 and multiply the result by 5.\n`/roll notation:2d10/d20`: Roll 2d20 and add the result together, then roll a d20 and divide the two totals.\n`/roll notation:3d20^4`: Roll 3d20 and raise the result to the power of 4.\n`/roll notation:(4-2)d10`: Subtract 2 from 4 and then roll a d10 that many times.\n`/roll notation:sqrt(4d10/3)`: Roll 4d10, divide by three and calculate the square root.",
      inline: false,
    },
  ],
  repeating: [
    {
      name: "Repeating rolls",
      value:
        "You can repeat any roll by using the `timestorepeat` parameter.\n\n`/roll notation:1d20+5 timestorepeat:6 `: Roll 1d20+5 6 times.\n\n `/roll notation:3d20+3d6 timestorepeat:10`: Roll 3d20 and 3d6 and add the results. Repeat ten times.",
      inline: false,
    },
  ],
};

const generateAndSendEmbed = async (
  content: KnowledgeBase[keyof KnowledgeBase],
  color: ColorResolvable,
  title: string,
  interaction?: CommandInteraction | ButtonInteraction
) => {
  const newEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(content);

  const response = {
    embeds: [newEmbed],
    components: [footerButtonRow],
  };

  if (interaction) {
    if (!interaction.deferred) {
      await interaction.deferReply();
    }
    await interaction.editReply(response);
  }
};

const command = {
  name: "knowledgebase",
  description: "Browse the knowledge base",
  aliases: ["kb"],
  usage: "[topic]",
  async execute({
    args,
    interaction,
  }: CommandProps) {
    if (!args.length || !kb[args[0]]) {
      await generateAndSendEmbed(
        [
          {
            name: "Available topics",
            value: `Type \`/knowledgebase <topic>\` to learn more\n\n\`${Object.keys(kb).join("\n")}\``,
            inline: false,
          },
        ],
        infoColor,
        "👩‍🎓 Knowledge base",
        interaction
      );
      return;
    }

    const article = kb[args[0]];
    await generateAndSendEmbed(
      article,
      infoColor,
      "👩‍🎓 Knowledge base",
      interaction
    );
  },
};

export default command;
