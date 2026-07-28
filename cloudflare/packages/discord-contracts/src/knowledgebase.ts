import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const INFO_COLOR = 0x1e_90_ff;
const TITLE = "👩‍🎓 Knowledge base";

export type KnowledgeBaseLinks = DiscordFooterLinks;

export type KnowledgeBaseInteraction = {
  topic: string;
};

type KnowledgeBaseField = {
  name: string;
  value: string;
  inline: false;
};

const ARTICLES: Record<string, KnowledgeBaseField[]> = {
  minmax: [
    {
      name: "Minimum and maximum",
      value:
        "`min` treats lower results as the minimum. `max` treats higher results as the maximum.\n\n`/roll notation:4d6min3`: Treat results below 3 as 3.\n`/roll notation:4d10max5`: Treat results above 5 as 5.\n`/roll notation:10d20max15min5`: Keep results between 5 and 15.",
      inline: false,
    },
  ],
  exploding: [
    {
      name: "Exploding dice",
      value:
        "Exploding dice roll another die when the condition matches. Without a comparison, they explode on their highest value.\n\n`/roll notation:2d6!`: Roll another d6 for each 6.\n`/roll notation:2d6!=5`: Roll another d6 for each 5.",
      inline: false,
    },
    {
      name: "Compounding",
      value:
        "Use `!!` to add extra rolls to the original die's result.\n\n`/roll notation:2d6!!=5`: Compound each d6 that rolls 5.",
      inline: false,
    },
    {
      name: "Penetrating",
      value:
        "Use `!p` to subtract 1 from each extra roll. Use `!!p` to compound and penetrate.\n\n`/roll notation:2d6!p=5`: Penetrate each d6 that rolls 5.\n`/roll notation:2d6!!p=5`: Compound and penetrate each d6 that rolls 5.",
      inline: false,
    },
  ],
  unique: [
    {
      name: "Unique dice",
      value:
        "Use `u` to reroll duplicates until every result is unique. Use `uo` to reroll each duplicate once. Both can use a comparison. A unique roll needs enough possible faces for the requested results.\n\n`/roll notation:4d6u`: Reroll duplicates until all four results are unique.\n`/roll notation:4d6u=5`: Reroll duplicate fives only.\n`/roll notation:4d6uo`: Reroll each duplicate once.",
      inline: false,
    },
  ],
  reroll: [
    {
      name: "Reroll dice",
      value:
        "Use `r` to reroll until the result no longer matches. Use `ro` to reroll once. Without a comparison, both reroll the die's lowest value.\n\n`/roll notation:4d10r<=3`: Reroll 3 or less until it no longer matches.\n`/roll notation:4d10ro<=3`: Reroll 3 or less once.",
      inline: false,
    },
  ],
  keepdrop: [
    {
      name: "Keep and drop",
      value:
        "`k` or `kh` keeps the highest dice. `kl` keeps the lowest. `d` or `dl` drops the lowest. `dh` drops the highest.\n\n`/roll notation:2d20k1`: Advantage.\n`/roll notation:2d20kl1`: Disadvantage.\n`/roll notation:4d10dh1`: Drop the highest result.",
      inline: false,
    },
  ],
  target: [
    {
      name: "Count successes and failures",
      value:
        "A comparison directly after the dice counts matching results. Add `f` before a second comparison to count failures.\n\n`/roll notation:6d10>=7`: Count 7 or higher as successes.\n`/roll notation:6d10>=7f=1`: Count 7 or higher as successes and 1 as failures.",
      inline: false,
    },
  ],
  crit: [
    {
      name: "Critical highlights",
      value:
        "Critical modifiers add a cosmetic illustration showing whether a die is critical. They do not change the total.\n\n`/roll notation:1d20cs=20`: Mark a 20 as a critical success.\n`/roll notation:5d20cs>=16`: Mark 16 or higher as a critical success.\n`/roll notation:1d20cf=1`: Mark a 1 as a critical failure.",
      inline: false,
    },
  ],
  sort: [
    {
      name: "Sort results",
      value:
        "Use `s` or `sa` to sort results from lowest to highest. Use `sd` for highest to lowest.\n\n`/roll notation:4d6sa`: Sort lowest to highest.\n`/roll notation:4d6sd`: Sort highest to lowest.",
      inline: false,
    },
  ],
  math: [
    {
      name: "Arithmetic and groups",
      value:
        "Use `+`, `-`, `*`, `/`, `^`, and parentheses directly in notation. Supported functions: `abs, ceil, cos, exp, floor, log, max, min, pow, round, sign, sin, sqrt, tan`. Use braces and commas to evaluate expressions together.\n\n`/roll notation:d6*5`: Multiply a d6 by 5.\n`/roll notation:sqrt(4d10/3)`: Divide 4d10 by 3, then calculate the square root.\n`/roll notation:{1d20+5, 2d6+3}`: Evaluate two expressions together.",
      inline: false,
    },
  ],
  repeating: [
    {
      name: "Repeating rolls",
      value:
        "Use the `times` option to repeat a roll from 1 to 50 times.\n\n`/roll notation:1d20+5 times:6`: Roll 1d20+5 six times.\n`/roll notation:3d20+3d6 times:10`: Roll 3d20+3d6 ten times.",
      inline: false,
    },
  ],
  fudge: [
    {
      name: "Fate or Fudge dice",
      value:
        "Fate or Fudge dice have six faces: two plus (+), two minus (-), and two blank (0).\n\n`/roll notation:4dF`: Roll four Fate or Fudge dice.\n`/roll notation:4dF+2`: Roll four and add 2.",
      inline: false,
    },
    {
      name: "Read the results",
      value:
        "Each + adds 1, each - subtracts 1, and each blank is 0.\n\n`[+, -, 0, +] = +1`\n`[-, -, +, 0] = -1`",
      inline: false,
    },
  ],
};

const BUTTON_TOPICS = new Set([
  "exploding",
  "reroll",
  "keepdrop",
  "target",
  "crit",
  "math",
  "sort",
  "repeating",
  "unique",
  "fudge",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIdentity(value: Record<string, unknown>, applicationId: string): boolean {
  return (
    typeof value.id === "string" &&
    SNOWFLAKE.test(value.id) &&
    value.application_id === applicationId &&
    typeof value.token === "string" &&
    INTERACTION_TOKEN.test(value.token)
  );
}

function parseCommandTopic(data: Record<string, unknown>): string {
  if (!Array.isArray(data.options) || data.options.length !== 1) {
    throw new Error("Knowledgebase options are invalid");
  }
  const option: unknown = data.options[0];
  if (
    !isRecord(option) ||
    option.name !== "topic" ||
    option.type !== 3 ||
    typeof option.value !== "string"
  ) {
    throw new Error("Knowledgebase topic is invalid");
  }
  const topic = option.value.trim().toLowerCase();
  if (topic.length < 1 || topic.length > 100) {
    throw new Error("Knowledgebase topic is invalid");
  }
  return topic;
}

export function parseKnowledgeBaseInteraction(
  value: unknown,
  applicationId: string,
  allowedGuildId?: string,
): KnowledgeBaseInteraction | null {
  if (!isRecord(value)) throw new Error("Interaction must be an object");
  if (value.application_id !== applicationId) return null;
  const guildId = value.guild_id;
  if (
    guildId !== undefined &&
    (typeof guildId !== "string" ||
      !SNOWFLAKE.test(guildId) ||
      (allowedGuildId !== undefined && guildId !== allowedGuildId))
  ) {
    return null;
  }
  if (!validIdentity(value, applicationId) || !isRecord(value.data)) {
    throw new Error("Knowledgebase interaction is invalid");
  }
  if (value.type === 2) {
    if (value.data.name !== "knowledgebase" || value.data.type !== 1) return null;
    return { topic: parseCommandTopic(value.data) };
  }
  if (value.type === 3) {
    if (
      value.data.component_type !== 2 ||
      typeof value.data.custom_id !== "string"
    ) {
      throw new Error("Knowledgebase button is invalid");
    }
    const match = /^knowledgebase-([a-z]+)$/.exec(value.data.custom_id);
    if (match === null) return null;
    const topic = match[1];
    if (topic === undefined || !BUTTON_TOPICS.has(topic)) return null;
    return { topic };
  }
  return null;
}

export function buildKnowledgeBaseResponse(
  topic: string,
  links: KnowledgeBaseLinks,
): Record<string, unknown> {
  const fields = ARTICLES[topic] ?? [
    {
      name: "Available topics",
      value: `Type \`/knowledgebase <topic>\` to learn more\n\n\`${Object.keys(ARTICLES).join("\n")}\``,
      inline: false as const,
    },
  ];
  return {
    type: 4,
    data: {
      embeds: [{ color: INFO_COLOR, title: TITLE, fields }],
      components: buildFooterComponents(links),
      allowed_mentions: { parse: [] },
    },
  };
}
