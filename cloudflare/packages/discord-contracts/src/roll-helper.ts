import { z } from "zod";
import type { RollExecutionResult } from "../../roll-domain/src";
import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";
import {
  DISCORD_COMPONENTS_V2_FLAG,
  type DiscordComponentsV2Message,
} from "./responses";
import {
  KNOWLEDGE_BASE_SELECT_CUSTOM_ID,
  KNOWLEDGE_BASE_TOPIC_OPTIONS,
} from "./knowledgebase";
import {
  boundaryObjectSchema,
  interactionTokenSchema,
  type SchemaInput,
  snowflakeSchema,
} from "./schema-primitives";

export const ROLL_HELPER_DM_CUSTOM_ID = "roll-help:dm-knowledgebase";

export type RollHelperDmInteraction = {
  id: string;
  applicationId: string;
  token: string;
  rollId: string;
  userId: string;
};

const RollHelperIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  token: interactionTokenSchema,
  guild_id: snowflakeSchema.optional(),
});
const RollHelperUserSchema = z.looseObject({ id: snowflakeSchema });

export function parseRollHelperDmInteraction(
  value: SchemaInput,
  applicationId: string,
  allowedGuildId?: string,
): RollHelperDmInteraction | null {
  const interaction = boundaryObjectSchema.safeParse(value);
  if (!interaction.success || interaction.data.application_id !== applicationId) {
    return null;
  }
  const data = boundaryObjectSchema.safeParse(interaction.data.data);
  if (
    interaction.data.type !== 3 ||
    !data.success ||
    data.data.component_type !== 2
  ) {
    return null;
  }
  const customId = z.string().safeParse(data.data.custom_id);
  if (
    !customId.success ||
    !customId.data.startsWith(`${ROLL_HELPER_DM_CUSTOM_ID}:`)
  ) {
    return null;
  }

  const identity = RollHelperIdentitySchema.safeParse(interaction.data);
  const rollId = snowflakeSchema.safeParse(
    customId.data.slice(ROLL_HELPER_DM_CUSTOM_ID.length + 1),
  );
  const member = boundaryObjectSchema.safeParse(interaction.data.member);
  const memberUser = member.success
    ? boundaryObjectSchema.safeParse(member.data.user)
    : null;
  const user = RollHelperUserSchema.safeParse(
    memberUser?.success ? memberUser.data : interaction.data.user,
  );
  if (
    !identity.success ||
    !rollId.success ||
    (identity.data.guild_id !== undefined &&
      allowedGuildId !== undefined &&
      identity.data.guild_id !== allowedGuildId) ||
    !user.success
  ) {
    throw new Error("Roll helper DM interaction is invalid");
  }
  return {
    id: identity.data.id,
    applicationId,
    token: identity.data.token,
    rollId: rollId.data,
    userId: user.data.id,
  };
}

const NOTATION_HELP_URL = "https://dicewit.ch/docs/dice-notation";

const ERROR_HEADLINES = {
  INVALID_NOTATION: "🚫 Invalid notation",
  NO_DICE: "🚫 Invalid notation",
  TOO_MANY_DICE: "Too many dice",
  TOO_MANY_SIDES: "Too many sides",
  NON_FINITE_TOTAL: "Invalid total",
  TOTAL_TOO_LARGE: "Total too large",
  UNSAFE_EXPLOSION: "🚫 Potentially infinite modifier",
} as const;

const NOTATION_ARTICLE = [
  "Write dice as `NdS`: the number of dice, `d`, then the number of sides.",
  "",
  "- `2d6` — two six-sided dice",
  "- `1d20+5` — one d20, then add 5",
  "- `4d6k3` — roll four d6 and keep the highest three",
  "- `2d6!` — roll two exploding d6",
  "",
  "Put modifiers directly after the dice they affect. Use normal arithmetic between rolls.",
  "",
  `[Read the complete Dice notation guide](${NOTATION_HELP_URL})`,
].join("\n");

export function buildInvalidRollHelpMessage(
  result: RollExecutionResult,
  rollId: string,
): DiscordComponentsV2Message {
  const firstError = result.errors[0];
  if (
    !snowflakeSchema.safeParse(rollId).success ||
    result.outcomes.length > 0 ||
    firstError === undefined
  ) {
    throw new Error("Roll result does not contain a terminal help error");
  }
  const error = result.errors.find(
    ({ code }) => code === "UNSAFE_EXPLOSION",
  ) ?? firstError;
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: 0xe7_4c_3c,
        components: [
          { type: 10, content: ERROR_HEADLINES[error.code] },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "Dice notation guide",
                url: NOTATION_HELP_URL,
              },
              {
                type: 2,
                style: 2,
                label: "DM me the knowledge base",
                custom_id: `${ROLL_HELPER_DM_CUSTOM_ID}:${rollId}`,
              },
            ],
          },
        ],
      },
    ],
  };
}

export function buildRollHelperMessage(
  links: DiscordFooterLinks,
): DiscordComponentsV2Message & { allowed_mentions: { parse: [] } } {
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: 0x00_00_ff,
        components: [
          { type: 10, content: `## 🎲 Dice notation\n${NOTATION_ARTICLE}` },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: KNOWLEDGE_BASE_SELECT_CUSTOM_ID,
                placeholder: "Choose a knowledge-base topic",
                min_values: 1,
                max_values: 1,
                options: KNOWLEDGE_BASE_TOPIC_OPTIONS.map(([value, label]) => ({
                  value,
                  label,
                })),
              },
            ],
          },
          ...buildFooterComponents(links),
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
