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

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;

export const ROLL_HELPER_DM_CUSTOM_ID = "roll-help:dm-knowledgebase";

export type RollHelperDmInteraction = {
  id: string;
  applicationId: string;
  token: string;
  rollId: string;
  userId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRollHelperDmInteraction(
  value: unknown,
  applicationId: string,
  allowedGuildId?: string,
): RollHelperDmInteraction | null {
  if (!isRecord(value) || value.application_id !== applicationId) return null;
  const data = value.data;
  if (
    value.type !== 3 ||
    !isRecord(data) ||
    data.component_type !== 2 ||
    typeof data.custom_id !== "string" ||
    !data.custom_id.startsWith(`${ROLL_HELPER_DM_CUSTOM_ID}:`)
  ) {
    return null;
  }
  const rollId = data.custom_id.slice(ROLL_HELPER_DM_CUSTOM_ID.length + 1);
  const guildId = value.guild_id;
  const member = value.member;
  const user = isRecord(member) && isRecord(member.user)
    ? member.user
    : value.user;
  if (
    typeof value.id !== "string" ||
    !SNOWFLAKE.test(value.id) ||
    typeof value.token !== "string" ||
    !INTERACTION_TOKEN.test(value.token) ||
    !SNOWFLAKE.test(rollId) ||
    (guildId !== undefined &&
      (typeof guildId !== "string" ||
        !SNOWFLAKE.test(guildId) ||
        (allowedGuildId !== undefined && guildId !== allowedGuildId))) ||
    !isRecord(user) ||
    typeof user.id !== "string" ||
    !SNOWFLAKE.test(user.id)
  ) {
    throw new Error("Roll helper DM interaction is invalid");
  }
  return {
    id: value.id,
    applicationId,
    token: value.token,
    rollId,
    userId: user.id,
  };
}

const NOTATION_HELP_URL = "https://dicewit.ch/docs/dice-notation";

const ERROR_HEADLINES = {
  INVALID_NOTATION: "🚫 Invalid notation",
  NO_DICE: "🚫 Invalid notation",
  TOO_MANY_DICE: "Too many dice",
  TOO_MANY_SIDES: "Too many sides",
  NON_FINITE_TOTAL: "Invalid total",
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
    !SNOWFLAKE.test(rollId) ||
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
