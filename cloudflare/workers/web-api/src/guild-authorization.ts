const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

type MembershipInspection =
  | { status: "found"; isAdmin: boolean; isDiceWitchAdmin: boolean }
  | { status: "missing" };

type GuildAuthorizationEnv = {
  DATA_SERVICE: Fetcher;
  DISCORD_REST: {
    inspectMembership(
      guildId: string,
      userId: string,
    ): Promise<MembershipInspection>;
  };
};

export type GuildMembershipProof = MembershipInspection;

export type GuildProofResult =
  | { status: "verified"; proof: GuildMembershipProof }
  | { status: "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function synchronizeGuildProof(
  env: GuildAuthorizationEnv,
  guildId: string,
  userId: string,
  now: number,
): Promise<GuildProofResult> {
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) {
    return { status: "unavailable" };
  }

  let inspection: MembershipInspection;
  try {
    inspection = await env.DISCORD_REST.inspectMembership(guildId, userId);
  } catch {
    return { status: "unavailable" };
  }

  const permissions = inspection.status === "found"
    ? inspection
    : { isAdmin: false, isDiceWitchAdmin: false };
  const response = await env.DATA_SERVICE.fetch(
    new Request("https://data.internal/internal/memberships/permissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        guildId,
        isAdmin: permissions.isAdmin,
        isDiceWitchAdmin: permissions.isDiceWitchAdmin,
        mutationId: `membership-proof:${crypto.randomUUID()}`,
        occurredAt: now,
      }),
    }),
  );
  if (!response.ok) return { status: "unavailable" };

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return { status: "unavailable" };
  }
  if (
    !isRecord(result) ||
    (result.status !== "applied" &&
      result.status !== "existing" &&
      result.status !== "superseded") ||
    !isRecord(result.permissions) ||
    typeof result.permissions.isAdmin !== "boolean" ||
    typeof result.permissions.isDiceWitchAdmin !== "boolean"
  ) {
    return { status: "unavailable" };
  }

  return inspection.status === "missing"
    ? { status: "verified", proof: inspection }
    : {
        status: "verified",
        proof: {
          status: "found",
          isAdmin: inspection.isAdmin && result.permissions.isAdmin,
          isDiceWitchAdmin:
            inspection.isDiceWitchAdmin &&
            result.permissions.isDiceWitchAdmin,
        },
      };
}
