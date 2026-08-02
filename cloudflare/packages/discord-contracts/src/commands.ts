export const DISCORD_GLOBAL_COMMANDS = [
  {
    name: "roll",
    description: "Throws some dice",
    options: [
      {
        name: "notation",
        description: "Dice notation, e.g. 1d6+2",
        type: 3,
        required: true,
      },
      {
        name: "title",
        description: "What is this roll for? e.g. attack with enchanted sword",
        type: 3,
      },
      {
        name: "times",
        description: "Number of times to repeat this roll",
        type: 3,
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
        description: "what you want to know about",
        type: 3,
        required: true,
        choices: [
          { name: "Exploding dice", value: "exploding" },
          { name: "Reroll dice", value: "reroll" },
          { name: "Unique dice", value: "unique" },
          { name: "Minimum and maximum", value: "minmax" },
          { name: "Keep and drop", value: "keepdrop" },
          { name: "Count successes and failures", value: "target" },
          { name: "Critical highlights", value: "crit" },
          { name: "Sort results", value: "sort" },
          { name: "Arithmetic and groups", value: "math" },
          { name: "Repeating rolls", value: "repeating" },
          { name: "Fate or Fudge dice", value: "fudge" },
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
  {
    type: 1,
    name: "library",
    description: "Runs a roll from your library",
    integration_types: [0],
    contexts: [0, 1],
    options: [
      {
        name: "name",
        description: "Personal or server library roll",
        type: 3,
        required: false,
        autocomplete: true,
      },
    ],
  },
] as const;
