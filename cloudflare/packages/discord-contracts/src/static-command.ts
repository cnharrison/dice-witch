import { z } from "zod";
import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";
import {
  boundaryObjectSchema,
  interactionTokenSchema,
  type SchemaInput,
  snowflakeSchema,
} from "./schema-primitives";

const PANACHE_COLOR = 0xff_00_ff;
const EPHEMERAL_FLAG = 64;
const THUMBNAIL_URL = "https://i.imgur.com/tBfG2pP.png";

const StaticInteractionCommandSchema = z.enum(["web", "prefs"]);
const StaticCommandIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  token: interactionTokenSchema,
  data: z.looseObject({ type: z.literal(1) }),
});
const EmptyOptionsSchema = z.tuple([]);

export type StaticInteractionCommand = z.infer<
  typeof StaticInteractionCommandSchema
>;

export function parseStaticInteractionCommand(
  value: SchemaInput,
  applicationId: string,
  allowedGuildId?: string,
): StaticInteractionCommand | null {
  const interaction = boundaryObjectSchema.safeParse(value);
  if (!interaction.success) throw new Error("Interaction must be an object");
  if (
    interaction.data.application_id !== applicationId ||
    interaction.data.type !== 2
  ) {
    return null;
  }

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

  const identity = StaticCommandIdentitySchema.safeParse(interaction.data);
  if (!identity.success) {
    throw new Error("Static command interaction is invalid");
  }
  const command = StaticInteractionCommandSchema.safeParse(
    identity.data.data.name,
  );
  if (!command.success) return null;
  if (
    identity.data.data.options !== undefined &&
    !EmptyOptionsSchema.safeParse(identity.data.data.options).success
  ) {
    throw new Error("Static command options are invalid");
  }
  return command.data;
}

export function buildWebAppRouteUrl(
  webAppUrl: string,
  route?: "library" | "preferences",
): string {
  const webUrl = new URL(webAppUrl);
  if (
    webUrl.protocol !== "https:" ||
    webUrl.username !== "" ||
    webUrl.password !== "" ||
    webUrl.hash !== ""
  ) {
    throw new Error("Web app URL is invalid");
  }
  if (route !== undefined) {
    webUrl.pathname = `${webUrl.pathname.replace(/\/$/, "")}/${route}`;
  }
  return webUrl.href;
}

export function buildStaticCommandResponse(
  command: StaticInteractionCommand,
  links: DiscordFooterLinks,
  webAppUrl: string,
) {
  const destination = buildWebAppRouteUrl(
    webAppUrl,
    command === "prefs" ? "preferences" : undefined,
  );
  const content =
    command === "web"
      ? {
          title: "Dice Witch Web Interface",
          description: `Control Dice Witch from the web: ${destination}`,
        }
      : {
          title: "Dice Witch Preferences",
          description: `Set user preferences and control Dice Witch from the web: ${destination}`,
        };
  return {
    type: 4,
    data: {
      flags: EPHEMERAL_FLAG | (1 << 15),
      components: [
        {
          type: 17,
          accent_color: PANACHE_COLOR,
          components: [
            {
              type: 9,
              components: [
                {
                  type: 10,
                  content: `## ${content.title}\n${content.description}`,
                },
              ],
              accessory: {
                type: 11,
                media: { url: THUMBNAIL_URL },
                description: "Dice Witch",
              },
            },
            ...buildFooterComponents(links),
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}
