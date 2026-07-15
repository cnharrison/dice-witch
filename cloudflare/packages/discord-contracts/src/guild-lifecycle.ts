const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function guildId(value: unknown): string {
  if (typeof value !== "string" || !SNOWFLAKE.test(value)) {
    throw new Error("Discord guild lifecycle data is invalid");
  }
  return value;
}

export function parseGuildLifecycleDispatch(
  eventType: string,
  value: unknown,
): GuildLifecycleEvent | null {
  if (eventType !== "GUILD_CREATE" && eventType !== "GUILD_DELETE") {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("Discord guild lifecycle data is invalid");
  }
  const id = guildId(value.id);
  if (eventType === "GUILD_DELETE" || value.unavailable === true) {
    return {
      type: value.unavailable === true ? "unavailable" : "deactivate",
      guildId: id,
    };
  }
  const joinedTimestamp =
    typeof value.joined_at === "string" ? Date.parse(value.joined_at) : NaN;
  if (
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 255 ||
    (value.icon !== null &&
      (typeof value.icon !== "string" || value.icon.length > 255)) ||
    typeof value.owner_id !== "string" ||
    !SNOWFLAKE.test(value.owner_id) ||
    !Number.isSafeInteger(value.member_count) ||
    Number(value.member_count) < 0 ||
    (value.approximate_member_count !== undefined &&
      (!Number.isSafeInteger(value.approximate_member_count) ||
        Number(value.approximate_member_count) < 0)) ||
    typeof value.preferred_locale !== "string" ||
    value.preferred_locale.length < 1 ||
    value.preferred_locale.length > 255 ||
    !Number.isSafeInteger(joinedTimestamp) ||
    joinedTimestamp < 0
  ) {
    throw new Error("Discord guild lifecycle data is invalid");
  }
  return {
    type: "upsert",
    guild: {
      id,
      name: value.name,
      icon: value.icon,
      ownerId: value.owner_id,
      memberCount: Number(value.member_count),
      approximateMemberCount:
        value.approximate_member_count === undefined
          ? null
          : Number(value.approximate_member_count),
      preferredLocale: value.preferred_locale,
      joinedTimestamp,
      isActive: true,
    },
  };
}
