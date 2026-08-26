import { z } from "zod";
import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";
import {
  boundaryObjectSchema,
  interactionTokenSchema,
  type BoundaryObject,
  type SchemaInput,
  snowflakeSchema,
} from "./schema-primitives";

const INFO_COLOR = 0x1e_90_ff;
const TITLE = "👩‍🎓 Knowledge base";
export const KNOWLEDGE_BASE_SELECT_CUSTOM_ID = "knowledgebase-topic";

export type KnowledgeBaseLinks = DiscordFooterLinks;

export type KnowledgeBaseInteraction = {
  topic: string;
};

type KnowledgeBaseField = {
  name: string;
  value: string;
  inline: false;
};

const ARTICLES = {
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
} as const satisfies Readonly<Record<string, readonly KnowledgeBaseField[]>>;

export const KNOWLEDGE_BASE_TOPIC_OPTIONS = [
  ["exploding", "Exploding dice"],
  ["reroll", "Reroll dice"],
  ["keepdrop", "Keep and drop"],
  ["target", "Count successes"],
  ["crit", "Critical highlights"],
  ["math", "Arithmetic and groups"],
  ["sort", "Sort results"],
  ["repeating", "Repeating rolls"],
  ["unique", "Unique dice"],
  ["fudge", "Fate or Fudge dice"],
] as const;

const ButtonTopicSchema = z.enum([
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
const ArticleTopicSchema = z.enum([
  "minmax",
  "exploding",
  "unique",
  "reroll",
  "keepdrop",
  "target",
  "crit",
  "sort",
  "math",
  "repeating",
  "fudge",
]);
const InteractionIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  token: interactionTokenSchema,
  data: boundaryObjectSchema,
});
const CommandOptionSchema = z.looseObject({
  name: z.literal("topic"),
  type: z.literal(3),
  value: z.string().min(1).max(100),
});
const CommandOptionsSchema = z.array(z.unknown()).length(1);
const SelectedTopicSchema = z.tuple([ButtonTopicSchema]);

function parseCommandTopic(data: BoundaryObject): string {
  const options = CommandOptionsSchema.safeParse(data.options);
  if (!options.success) {
    throw new Error("Knowledgebase options are invalid");
  }
  const option = CommandOptionSchema.safeParse(options.data[0]);
  if (!option.success) {
    throw new Error("Knowledgebase topic is invalid");
  }
  const topic = option.data.value.trim().toLowerCase();
  if (topic.length < 1) {
    throw new Error("Knowledgebase topic is invalid");
  }
  return topic;
}

export function parseKnowledgeBaseInteraction(
  value: SchemaInput,
  applicationId: string,
  allowedGuildId?: string,
): KnowledgeBaseInteraction | null {
  const interaction = boundaryObjectSchema.safeParse(value);
  if (!interaction.success) throw new Error("Interaction must be an object");
  if (interaction.data.application_id !== applicationId) return null;

  const guildId = interaction.data.guild_id;
  if (guildId !== undefined) {
    const guild = snowflakeSchema.safeParse(guildId);
    if (
      !guild.success ||
      (allowedGuildId !== undefined && guild.data !== allowedGuildId)
    ) {
      return null;
    }
  }

  const identity = InteractionIdentitySchema.safeParse(interaction.data);
  if (!identity.success) {
    throw new Error("Knowledgebase interaction is invalid");
  }
  const data = identity.data.data;
  if (interaction.data.type === 2) {
    if (data.name !== "knowledgebase" || data.type !== 1) return null;
    return { topic: parseCommandTopic(data) };
  }
  if (interaction.data.type !== 3) return null;

  const customId = z.string().safeParse(data.custom_id);
  if (!customId.success) {
    throw new Error("Knowledgebase component is invalid");
  }
  if (data.component_type === 3) {
    const selectedTopic = SelectedTopicSchema.safeParse(data.values);
    if (
      customId.data !== KNOWLEDGE_BASE_SELECT_CUSTOM_ID ||
      !selectedTopic.success
    ) {
      throw new Error("Knowledgebase select is invalid");
    }
    return { topic: selectedTopic.data[0] };
  }
  if (data.component_type !== 2) {
    throw new Error("Knowledgebase component is invalid");
  }
  if (!/^knowledgebase-[a-z]+$/u.test(customId.data)) return null;
  const topic = ButtonTopicSchema.safeParse(
    customId.data.slice("knowledgebase-".length),
  );
  return topic.success ? { topic: topic.data } : null;
}

type KnowledgeBaseTopicOption = {
  value: string;
  label: string;
  default?: true;
};

function buildTopicOptions(topic: string): KnowledgeBaseTopicOption[] {
  return KNOWLEDGE_BASE_TOPIC_OPTIONS.map(([value, label]) => {
    const option: KnowledgeBaseTopicOption = { value, label };
    if (value === topic) option.default = true;
    return option;
  });
}

export function buildKnowledgeBaseResponse(
  topic: string,
  links: KnowledgeBaseLinks,
) {
  const articleTopic = ArticleTopicSchema.safeParse(topic);
  const fields: readonly KnowledgeBaseField[] = articleTopic.success
    ? ARTICLES[articleTopic.data]
    : [
        {
          name: "Available topics",
          value: `Type \`/knowledgebase <topic>\` to learn more\n\n\`${Object.keys(ARTICLES).join("\n")}\``,
          inline: false,
        },
      ];
  return {
    type: 4,
    data: {
      flags: 1 << 15,
      components: [
        {
          type: 17,
          accent_color: INFO_COLOR,
          components: [
            { type: 10, content: `## ${TITLE}` },
            ...fields.map((field) => ({
              type: 10,
              content: `### ${field.name}\n${field.value}`,
            })),
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: KNOWLEDGE_BASE_SELECT_CUSTOM_ID,
                  placeholder: "Choose a knowledge-base topic",
                  min_values: 1,
                  max_values: 1,
                  options: buildTopicOptions(topic),
                },
              ],
            },
            ...buildFooterComponents(links),
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}
