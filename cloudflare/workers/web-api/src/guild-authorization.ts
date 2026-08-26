import { z } from "zod";
import {
  snowflakeSchema,
  strictObjectSchema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";

const MembershipInspectionSchema = z.discriminatedUnion("status", [
  strictObjectSchema({
    status: z.literal("found"),
    isAdmin: z.boolean(),
    isDiceWitchAdmin: z.boolean(),
  }),
  strictObjectSchema({ status: z.literal("missing") }),
]);
const MembershipPermissionResultSchema = strictObjectSchema({
  status: z.enum(["applied", "existing", "superseded"]),
  permissions: strictObjectSchema({
    isAdmin: z.boolean(),
    isDiceWitchAdmin: z.boolean(),
  }),
});

type MembershipInspection = z.output<typeof MembershipInspectionSchema>;
type GuildAuthorizationEnv = {
  DATA_SERVICE: Fetcher;
  DISCORD_REST: {
    inspectMembership(guildId: string, userId: string): Promise<SchemaInput>;
  };
};

type MembershipPermissionRequest = {
  userId: string;
  guildId: string;
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
  mutationId: string;
  occurredAt: number;
};

export type GuildMembershipProof = MembershipInspection;

export type GuildProofResult =
  | { status: "verified"; proof: GuildMembershipProof }
  | { status: "unavailable" };

async function inspectMembership(
  env: GuildAuthorizationEnv,
  guildId: string,
  userId: string,
): Promise<MembershipInspection> {
  return MembershipInspectionSchema.parse(
    await env.DISCORD_REST.inspectMembership(guildId, userId),
  );
}

async function updateMembershipPermissions(
  dataService: Fetcher,
  request: MembershipPermissionRequest,
): Promise<Response> {
  return dataService.fetch(
    new Request("https://data.internal/internal/memberships/permissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

export async function synchronizeGuildProof(
  env: GuildAuthorizationEnv,
  guildId: string,
  userId: string,
  now: number,
): Promise<GuildProofResult> {
  if (!snowflakeSchema.safeParse(guildId).success || !snowflakeSchema.safeParse(userId).success) {
    return { status: "unavailable" };
  }

  let inspection: MembershipInspection;
  try {
    inspection = await inspectMembership(env, guildId, userId);
  } catch {
    return { status: "unavailable" };
  }

  const permissions = inspection.status === "found"
    ? inspection
    : { isAdmin: false, isDiceWitchAdmin: false };
  const response = await updateMembershipPermissions(env.DATA_SERVICE, {
    userId,
    guildId,
    isAdmin: permissions.isAdmin,
    isDiceWitchAdmin: permissions.isDiceWitchAdmin,
    mutationId: `membership-proof:${crypto.randomUUID()}`,
    occurredAt: now,
  });
  if (!response.ok) return { status: "unavailable" };

  let result: z.output<typeof MembershipPermissionResultSchema>;
  try {
    result = MembershipPermissionResultSchema.parse(await response.json());
  } catch {
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
