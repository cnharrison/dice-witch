import { ApplicationCommandDataResolvable, ApplicationCommandOptionType } from "discord.js";

export const globalSlashCommands: ApplicationCommandDataResolvable[] = [
  {
    name: "roll",
    description: "Throws some dice",
    options: [
      {
        name: "notation",
        required: true,
        description: "Dice notation, e.g. 1d6+2",
        type: ApplicationCommandOptionType.String,
      },
      {
        name: "title",
        description: "What is this roll for? e.g. attack with enchanted sword",
        type: ApplicationCommandOptionType.String,
      },
      {
        name: "timestorepeat",
        description:
          "If you would like to repeat this roll, enter the number of times here.",
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    name: "status",
    description: "Pings Dice Witch",
  },
  {
    name: "knowledgebase",
    description: "Shows the Dice Witch knowledgebase",
    options: [
      {
        name: "topic",
        required: true,
        description: "what you want to know about",
        type: ApplicationCommandOptionType.String,
        choices: [
          { name: "Exploding dice", value: "exploding" },
          { name: "Auto-reroll", value: "reroll" },
          { name: "Keep/drop AKA advantage", value: "keepdrop" },
          { name: "Target success/failure AKA Dice pool", value: "target" },
          { name: "Critical success/failure", value: "crit" },
          { name: "Sorting", value: "sort" },
          { name: "Math", value: "math" },
          { name: "Repeating", value: "repeating" },
        ],
      },
    ],
  },
  {
    name: "web",
    description: "Access Dice Witch's web interface",
  },
  {
    name: "prefs",
    description: "Set your preferences on the web",
  },
];