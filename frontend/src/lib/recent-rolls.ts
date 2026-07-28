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

type StoredRecentRolls = Readonly<{
  version: 3;
  rolls: readonly RecentRoll[];
}>;

type PreviousStoredRecentRolls = Readonly<{
  version: 2;
  rolls: readonly PreviousRecentRoll[];
}>;

type PreviousRecentRoll = Omit<RecentRoll, "libraryRoll"> & {
  libraryRoll?: Omit<RecentLibraryRoll, "nameColor">;
};

type LegacyStoredRecentRolls = Readonly<{
  version: 1;
  rolls: readonly Omit<RecentRoll, "libraryRoll">[];
}>;

export function readRecentRolls(
  storage: Pick<Storage, "getItem">,
  userId: string,
): RecentRoll[] {
  if (!SNOWFLAKE.test(userId)) return [];
  try {
    const raw = storage.getItem(`${RECENT_ROLL_STORAGE_PREFIX}${userId}`);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (isStoredRecentRolls(value)) {
      return value.rolls.slice(0, MAX_RECENT_ROLLS);
    }
    if (isPreviousStoredRecentRolls(value)) {
      return value.rolls.slice(0, MAX_RECENT_ROLLS).map((roll) => ({
        ...roll,
        ...(roll.libraryRoll === undefined
          ? {}
          : { libraryRoll: { ...roll.libraryRoll, nameColor: null } }),
      }));
    }
    if (!isLegacyStoredRecentRolls(value)) return [];
    return value.rolls.slice(0, MAX_RECENT_ROLLS);
  } catch {
    return [];
  }
}

export function addRecentRoll(
  storage: Pick<Storage, "getItem" | "setItem">,
  userId: string,
  roll: RecentRoll,
): RecentRoll[] {
  if (!SNOWFLAKE.test(userId) || !isRecentRoll(roll)) {
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

function isStoredRecentRolls(value: unknown): value is StoredRecentRolls {
  return typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 3 &&
    "rolls" in value &&
    Array.isArray(value.rolls) &&
    value.rolls.length <= MAX_RECENT_ROLLS &&
    value.rolls.every(isRecentRoll);
}

function isPreviousStoredRecentRolls(
  value: unknown,
): value is PreviousStoredRecentRolls {
  return typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 2 &&
    "rolls" in value &&
    Array.isArray(value.rolls) &&
    value.rolls.length <= MAX_RECENT_ROLLS &&
    value.rolls.every(isPreviousRecentRoll);
}

function isPreviousRecentRoll(value: unknown): value is PreviousRecentRoll {
  return isRecentRollBase(value) &&
    (!("libraryRoll" in value) ||
      value.libraryRoll === undefined ||
      isPreviousRecentLibraryRoll(value.libraryRoll));
}

function isLegacyStoredRecentRolls(
  value: unknown,
): value is LegacyStoredRecentRolls {
  return typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "rolls" in value &&
    Array.isArray(value.rolls) &&
    value.rolls.length <= LEGACY_MAX_RECENT_ROLLS &&
    value.rolls.every(
      (roll) => isRecentRoll(roll) && roll.libraryRoll === undefined,
    );
}

function isRecentRollBase(value: unknown): value is Record<string, unknown> & {
  notation: string;
  title: string | null;
  repetitions: number;
} {
  return typeof value === "object" &&
    value !== null &&
    "notation" in value &&
    typeof value.notation === "string" &&
    value.notation.length >= 1 &&
    value.notation.length <= MAX_NOTATION_LENGTH &&
    "title" in value &&
    (value.title === null ||
      (typeof value.title === "string" && value.title.length <= MAX_TITLE_LENGTH)) &&
    "repetitions" in value &&
    typeof value.repetitions === "number" &&
    Number.isSafeInteger(value.repetitions) &&
    value.repetitions >= 1 &&
    value.repetitions <= 50;
}

function isRecentRoll(value: unknown): value is RecentRoll {
  return isRecentRollBase(value) &&
    (!("libraryRoll" in value) ||
      value.libraryRoll === undefined ||
      isRecentLibraryRoll(value.libraryRoll));
}

function isPreviousRecentLibraryRoll(
  value: unknown,
): value is Omit<RecentLibraryRoll, "nameColor"> {
  return isRecentLibraryRollBase(value);
}

function isRecentLibraryRollBase(value: unknown): value is Record<string, unknown> &
  Omit<RecentLibraryRoll, "nameColor"> {
  return typeof value === "object" &&
    value !== null &&
    "scope" in value &&
    (value.scope === "personal" || value.scope === "server") &&
    "id" in value &&
    typeof value.id === "string" &&
    UUID_V4.test(value.id) &&
    "revision" in value &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 1 &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    value.displayName.length >= 1 &&
    value.displayName.length <= MAX_DISPLAY_NAME_LENGTH;
}

function isRecentLibraryRoll(value: unknown): value is RecentLibraryRoll {
  return isRecentLibraryRollBase(value) &&
    "nameColor" in value &&
    (value.nameColor === null ||
      (typeof value.nameColor === "string" && NAME_COLOR.test(value.nameColor)));
}
