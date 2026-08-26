import { z } from "zod";
import {
  boundedNameSchema,
  nonNegativeSafeIntegerSchema,
  type SchemaInput,
  snowflakeSchema,
  timestampSchema,
} from "./schema-primitives";

const GuildLifecycleIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  unavailable: z.unknown().optional(),
});
const JoinedTimestampSchema = z
  .string()
  .transform((value) => Date.parse(value))
  .pipe(timestampSchema);
const GuildLifecycleProfileSchema = z.looseObject({
  id: snowflakeSchema,
  name: boundedNameSchema(1, 255),
  icon: z.nullable(z.string().max(255)),
  owner_id: snowflakeSchema,
  member_count: nonNegativeSafeIntegerSchema,
  approximate_member_count: nonNegativeSafeIntegerSchema.optional(),
  preferred_locale: boundedNameSchema(1, 255),
  joined_at: JoinedTimestampSchema,
});

export type GuildLifecycleProfile = {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  memberCount: number;
  approximateMemberCount: number | null;
  preferredLocale: string;
  joinedTimestamp: number;
  isActive: true;
};

export type GuildLifecycleEvent =
  | { type: "upsert"; guild: GuildLifecycleProfile }
  | { type: "deactivate" | "unavailable"; guildId: string };

export function parseGuildLifecycleDispatch(
  eventType: string,
  value: SchemaInput,
): GuildLifecycleEvent | null {
  if (eventType !== "GUILD_CREATE" && eventType !== "GUILD_DELETE") {
    return null;
  }
  const identity = GuildLifecycleIdentitySchema.safeParse(value);
  if (!identity.success) {
    throw new Error("Discord guild lifecycle data is invalid");
  }
  if (eventType === "GUILD_DELETE" || identity.data.unavailable === true) {
    return {
      type: identity.data.unavailable === true ? "unavailable" : "deactivate",
      guildId: identity.data.id,
    };
  }

  const profile = GuildLifecycleProfileSchema.safeParse(value);
  if (!profile.success) {
    throw new Error("Discord guild lifecycle data is invalid");
  }
  return {
    type: "upsert",
    guild: {
      id: profile.data.id,
      name: profile.data.name,
      icon: profile.data.icon,
      ownerId: profile.data.owner_id,
      memberCount: profile.data.member_count,
      approximateMemberCount: profile.data.approximate_member_count ?? null,
      preferredLocale: profile.data.preferred_locale,
      joinedTimestamp: profile.data.joined_at,
      isActive: true,
    },
  };
}
