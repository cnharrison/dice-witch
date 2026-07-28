import type { RollExecutionResult } from "../../roll-domain/src";
import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";
import type { DiscordMessage } from "./responses";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;

const BUTTON_ROWS = [
  [
    ["knowledgebase-exploding", "Exploding 💥"],
    ["knowledgebase-reroll", "Re-roll ♻"],
    ["knowledgebase-keepdrop", "Keep/drop 🚮"],
    ["knowledgebase-target", "Targets 🎯"],
    ["knowledgebase-crit", "Criticals ⚔"],
  ],
  [
    ["knowledgebase-math", "Math 🧮"],
    ["knowledgebase-sort", "Sorting ↕"],
    ["knowledgebase-repeating", "Repeating 👯‍♀️"],
    ["knowledgebase-unique", "Unique ❄️"],
    ["knowledgebase-fudge", "Fudge 🎲"],
  ],
] as const;

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

const NOTATION_HELP_URL =
  "https://dicewit.ch/docs/dice-notation#fix-an-invalid-roll";
const EXPLODING_DICE_HELP_URL =
  "https://dicewit.ch/docs/modifiers#exploding-dice";

export function buildInvalidRollHelpMessage(
  result: RollExecutionResult,
  rollId: string,
): DiscordMessage {
  if (
    !SNOWFLAKE.test(rollId) ||
    result.outcomes.length > 0 ||
    result.errors.length === 0
  ) {
    throw new Error("Roll result does not contain a terminal help error");
  }
  const modifierHelp = result.errors.some(
    ({ code }) => code === "UNSAFE_EXPLOSION",
  );
  return {
    content: modifierHelp
      ? "That modifier needs fixing."
      : "That dice notation needs fixing.",
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: modifierHelp ? "Fix the modifier" : "Fix dice notation",
            url: modifierHelp ? EXPLODING_DICE_HELP_URL : NOTATION_HELP_URL,
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
  };
}

export function buildRollHelperMessage(
  links: DiscordFooterLinks,
): Record<string, unknown> {
  const description =
    "Use `/knowledgebase` and choose a topic, or choose one below.";
  return {
    embeds: [
      {
        color: 0x00_00_ff,
        fields: [{ name: "Need help? 😅", value: description }],
      },
    ],
    components: [
      ...BUTTON_ROWS.map((buttons) => ({
        type: 1,
        components: buttons.map(([customId, label]) => ({
          type: 2,
          style: 1,
          custom_id: customId,
          label,
        })),
      })),
      ...buildFooterComponents(links),
    ],
    allowed_mentions: { parse: [] },
  };
}
