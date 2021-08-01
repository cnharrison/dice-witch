import Discord, { ColorResolvable, CommandInteraction, Message } from "discord.js";
import { KnowledgeBase } from "../types";
import { prefix, inviteLink, supportServerLink } from "../../config.json";
import { infoColor } from "../constants";

module.exports = {
  name: "knowledgebase",
  description: "Browse the knowledge base",
  aliases: ["kb"],
  usage: "[topic]",
  async execute(message: Message, args: string[], _: any, __: any, ___: any, interaction: CommandInteraction) {
    const kb: KnowledgeBase = {
      minmax: [
        {
          name: "Min/Max",
          value:
            "Cause any rolls above/below the value to be treated as equal to the minimum/maximum value.\n\n`!roll 4d6min3`: Roll four d6 where values less than three are treated as equal to three.\n`!roll 4d10max5`: Roll four d10 where values greater than five are treated as equal to five.\n`!roll 10d20max15min5`: Roll ten d20 where values greater than fifteen are treated as equal to fifteen, and values less than five are treated as equal to five.",
        },
      ],
      exploding: [
        {
          name: "Exploding dice",
          value:
            "Allows one or more dice to be re-rolled (Usually when it rolls the highest possible number on the die), with each successive roll being added to the total.\n\n`!roll 2d6!=5`: Roll two d6 and explode on any roll equal to five.\n`!roll 2d!>4`: Roll two d6 and explode on any roll greater than four.\n`!roll 4d10!<=3`: Roll four d10 and explode on any roll less than or equal to three.",
        },
        {
          name: "Compounding",
          value:
            "Just like exploding, but exploded dice will be combined together in a single roll instead of being re-rolled. You can mark exploding dice to compound by using `!!` instead of `!`\n\n`!roll 2d6!!=5`: Roll two d6 and explode and compound on any roll equal to five.",
        },
        {
          name: "Penetrating",
          value:
            "A type of exploding dice most commonly used in the Hackmaster system. From the rules:\n`Should you roll the maximum value on this particular die, you may re-roll and add the result of the extra die, less one point, to the total (penetration can actually result in simply the maximum die value if a 1 is subsequently rolled, since any fool knows that 1-1=0). This process continues indefinitely as long as the die in question continues to come up maximum (but there’s always only a –1 subtracted from the extra die, even if it’s, say, the third die of penetration)`\n\nYou can mark exploding dice to penetrate by using `!p` instead of `!`.\n\n`!roll 2d6!p=5`: Roll two d6 and explode and penetrate on any roll equal to five.",
        },
      ],
      reroll: [
        {
          name: "Re-roll",
          value:
            "Rerolls a die that rolls the lowest possible number on that die, until a number greater than the minimum is rolled.\n\n`!roll 1d10r`: Roll 1d10 and reroll on one.\n`!roll 4d10r<=3`: Roll 4d10 and reroll on any result less than or equal to three.",
        },
      ],
      keepdrop: [
        {
          name: "Keep/Drop AKA Advantage",
          value:
            "Disregard or keep all dice above or below a certain threshold.\n\n`!roll 4d10k2`: Roll 4d10 and keep the highest two rolls\n`!roll 4d10kl2`: Roll 4d10 and keep the lowest two rolls.\n`!roll 4d10d1`: Roll 4d10 and disregard the lowest roll.\n`!roll 4d10dh1`: Roll 4d10 and disregard the highest roll",
        },
      ],
      target: [
        {
          name: "Target success/failure AKA Dice pool",
          value:
            "Counts the number of dice that meet a criterion.\n\n`!roll 2d6=6`: Roll 2d6 and count the number of dice that equal six.\n`!roll 6d10<=4`: Roll 6d10 and count the number of dice that are less than or equal to four",
        },
      ],
      crit: [
        {
          name: "Critical success/failure",
          value:
            "This is an aesthetic feature that makes it super clear when a die has rolled the highest or lowest possible value. It makes no difference to the roll or its value.\n\n`!roll 1d20cs=20`: Roll 1d20 and highlight if result is 20.\n`!roll 5d20cs>=16`: Roll 5d20 and highlight if result is greater than 16.\n`!roll 1d20cf=1`: Roll 1d20 and highlight result is 1.",
        },
      ],
      sort: [
        {
          name: "Sorting",
          value:
            "Sorts the results of any of your rolls in ascending or descending numerical order.\n\n`!roll 4d6`: Roll 4d6 and do not sort.\n`!roll 4d6s`: Roll 4d6 and sort results in ascending order.\n`!roll 4d6sa`: Same as above.\n`!roll 4d6sd`: Roll 4d6 and sort results in descending order.",
        },
      ],
      math: [
        {
          name: "Math",
          value:
            "You can use add, subtract, multiply, divide, reduce, and parenthesis in most places inside dice notation. You can also use the following JS math functions: `abs, ceil, cos, exp, floor, log, max, min, pow, round, sign, sin, sqrt, tan`\n\n`!roll d6*5`: Roll a d6 and multiply the result by 5.\n`!roll 2d10/d20`: Roll 2d20 and add the result together, then roll a d20 and divide the two totals.\n`!roll 3d20^4`: Roll 3d20 and raise the result to the power of 4.\n`!roll (4-2)d10`: Subtract 2 from 4 and then roll a d10 that many times.\n`!roll sqrt(4d10/3)`: Roll 4d10, divide by three and calculate the square root",
        },
      ],
      repeating: [
        {
          name: "Repeating rolls",
          value:
            "You can repeat any roll by inserting a `<times to repeat>` string anywhere in your notation.\n\n`!roll <6> 1d20+5`: Roll 1d20+5 6 times.\n\n `!roll 3d20+3d6 <10>`: Roll 3d20 and 3d6 and add the results. Repeat ten times.",
        },
      ],
    };
    const generateAndSendEmbed = async (
      content: KnowledgeBase[keyof KnowledgeBase],
      message: Message,
      color: ColorResolvable,
      title: string
    ) => {
      const newEmbed = new Discord.MessageEmbed()
        .setColor(color)
        .setTitle(title);
      newEmbed.addFields(content);
      newEmbed.addField(
        "\u200B",
        `_Sent to ${interaction ? interaction.user.username : message.author.username}_ | [Invite me](${inviteLink}) | Questions? join the [Support server](${supportServerLink})`
      );
      await message.channel.send({ embeds: [newEmbed] });
    };

    if (!args.length || !Object.keys(kb).includes(args[0])) {
      generateAndSendEmbed(
        [
          {
            name: "Available topics",
            value: `Type \`${prefix}${module.exports.aliases.reduce(
              (a: string, b: string) => (a.length <= b.length ? a : b)
            )} <topic>\` to learn more\n\n\`${Object.keys(kb).join("\n")}\``,
          },
        ],
        message,
        infoColor,
        "👩‍🎓 Knowledge base"
      );
      return;
    }
    const article = kb[args[0]];
    generateAndSendEmbed(
      article,
      message,
      infoColor,
      "👩‍🎓 Knowledge base"
    );
    return;
  },
};
