import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const PANACHE_COLOR = 0xff_00_ff;
const EPHEMERAL_FLAG = 64;
const THUMBNAIL_URL = "https://i.imgur.com/tBfG2pP.png";

export type StaticInteractionCommand = "web" | "prefs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStaticInteractionCommand(
  value: unknown,
  applicationId: string,
  allowedGuildId?: string,
): StaticInteractionCommand | null {
  if (!isRecord(value)) throw new Error("Interaction must be an object");
  if (value.application_id !== applicationId || value.type !== 2) return null;
  const guildId = value.guild_id;
  if (
    (guildId !== undefined &&
      (typeof guildId !== "string" || !SNOWFLAKE.test(guildId))) ||
    (allowedGuildId !== undefined &&
      guildId !== undefined &&
      guildId !== allowedGuildId)
  ) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    !SNOWFLAKE.test(value.id) ||
    typeof value.token !== "string" ||
    !INTERACTION_TOKEN.test(value.token) ||
    !isRecord(value.data) ||
    value.data.type !== 1
  ) {
    throw new Error("Static command interaction is invalid");
  }
  if (value.data.name !== "web" && value.data.name !== "prefs") return null;
  if (
    value.data.options !== undefined &&
    (!Array.isArray(value.data.options) || value.data.options.length !== 0)
  ) {
    throw new Error("Static command options are invalid");
  }
  return value.data.name;
}

export function buildStaticCommandResponse(
  command: StaticInteractionCommand,
  links: DiscordFooterLinks,
  webAppUrl: string,
): Record<string, unknown> {
  const webUrl = new URL(webAppUrl);
  if (
    webUrl.protocol !== "https:" ||
    webUrl.username !== "" ||
    webUrl.password !== "" ||
    webUrl.hash !== ""
  ) {
    throw new Error("Web app URL is invalid");
  }
  const content =
    command === "web"
      ? {
          title: "Dice Witch Web Interface",
          description: `Control Dice Witch from the web: ${webUrl.href}`,
        }
      : {
          title: "Dice Witch Preferences",
          description: `Set user preferences and control Dice Witch from the web: ${webUrl.href}`,
        };
  return {
    type: 4,
    data: {
      flags: EPHEMERAL_FLAG,
      embeds: [
        {
          color: PANACHE_COLOR,
          title: content.title,
          description: content.description,
          thumbnail: { url: THUMBNAIL_URL },
        },
      ],
      components: buildFooterComponents(links),
      allowed_mentions: { parse: [] },
    },
  };
}
