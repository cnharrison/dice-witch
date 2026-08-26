import * as z from "zod";

const RECENT_ROLL_STORAGE_PREFIX = "dice-witch-recent-rolls-v1:";
const MAX_RECENT_ROLLS = 3;
const LEGACY_MAX_RECENT_ROLLS = 10;
const MAX_NOTATION_LENGTH = 6_000;
const MAX_TITLE_LENGTH = 256;
const MAX_DISPLAY_NAME_LENGTH = 1_024;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NAME_COLOR = /^#[0-9A-F]{6}$/u;

export type RecentLibraryRoll = Readonly<{
  scope: "personal" | "server";
  id: string;
  revision: number;
  displayName: string;
  nameColor: string | null;
}>;

export type RecentRoll = Readonly<{
  notation: string;
  title: string | null;
  repetitions: number;
  libraryRoll?: RecentLibraryRoll;
}>;

const recentLibraryRollBaseSchema = z.object({
  scope: z.enum(["personal", "server"]),
  id: z.string().regex(UUID_V4),
  revision: z.number().int().min(1),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
});
const recentLibraryRollSchema = recentLibraryRollBaseSchema.extend({
  nameColor: z.string().regex(NAME_COLOR).nullable(),
});
const recentRollBaseSchema = z.object({
  notation: z.string().min(1).max(MAX_NOTATION_LENGTH),
  title: z.string().max(MAX_TITLE_LENGTH).nullable(),
  repetitions: z.number().int().min(1).max(50),
});
const recentRollSchema = recentRollBaseSchema.extend({
  libraryRoll: recentLibraryRollSchema.optional(),
});
const previousRecentRollSchema = recentRollBaseSchema.extend({
  libraryRoll: recentLibraryRollBaseSchema.optional(),
});
const legacyRecentRollSchema = recentRollBaseSchema.strict();
const storedRecentRollsSchema = z.object({
  version: z.literal(3),
  rolls: z.array(recentRollSchema).max(MAX_RECENT_ROLLS),
});
const previousStoredRecentRollsSchema = z.object({
  version: z.literal(2),
  rolls: z.array(previousRecentRollSchema).max(MAX_RECENT_ROLLS),
});
const legacyStoredRecentRollsSchema = z.object({
  version: z.literal(1),
  rolls: z.array(legacyRecentRollSchema).max(LEGACY_MAX_RECENT_ROLLS),
});

export function readRecentRolls(
  storage: Pick<Storage, "getItem">,
  userId: string,
): RecentRoll[] {
  if (!SNOWFLAKE.test(userId)) return [];
  try {
    const raw = storage.getItem(`${RECENT_ROLL_STORAGE_PREFIX}${userId}`);
    if (raw === null) return [];
    const value = z.json().parse(JSON.parse(raw));
    const stored = storedRecentRollsSchema.safeParse(value);
    if (stored.success) return stored.data.rolls.slice(0, MAX_RECENT_ROLLS);
    const previous = previousStoredRecentRollsSchema.safeParse(value);
    if (previous.success) {
      return previous.data.rolls.slice(0, MAX_RECENT_ROLLS).map((roll) => {
        if (roll.libraryRoll === undefined) return roll;
        return {
          ...roll,
          libraryRoll: { ...roll.libraryRoll, nameColor: null },
        };
      });
    }
    const legacy = legacyStoredRecentRollsSchema.safeParse(value);
    return legacy.success
      ? legacy.data.rolls.slice(0, MAX_RECENT_ROLLS)
      : [];
  } catch {
    return [];
  }
}

export function addRecentRoll(
  storage: Pick<Storage, "getItem" | "setItem">,
  userId: string,
  roll: RecentRoll,
): RecentRoll[] {
  if (!SNOWFLAKE.test(userId) || !recentRollSchema.safeParse(roll).success) {
    throw new Error("Recent roll is invalid");
  }
  const key = recentRollKey(roll);
  const rolls = [
    roll,
    ...readRecentRolls(storage, userId).filter(
      (candidate) => recentRollKey(candidate) !== key,
    ),
  ].slice(0, MAX_RECENT_ROLLS);
  storage.setItem(
    `${RECENT_ROLL_STORAGE_PREFIX}${userId}`,
    JSON.stringify({ version: 3, rolls } satisfies StoredRecentRolls),
  );
  return rolls;
}

export function clearRecentRolls(
  storage: Pick<Storage, "setItem">,
  userId: string,
): void {
  if (!SNOWFLAKE.test(userId)) return;
  storage.setItem(
    `${RECENT_ROLL_STORAGE_PREFIX}${userId}`,
    JSON.stringify({ version: 3, rolls: [] } satisfies StoredRecentRolls),
  );
}

export function recentRollKey(roll: RecentRoll): string {
  return roll.libraryRoll === undefined
    ? JSON.stringify(["manual", roll.notation, roll.title, roll.repetitions])
    : JSON.stringify([
        "library",
        roll.libraryRoll.scope,
        roll.libraryRoll.id,
      ]);
}
