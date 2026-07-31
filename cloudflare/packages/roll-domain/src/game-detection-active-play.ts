export const GAME_DETECTION_ACTIVE_PLAY_POLICY_REVISION_V1 = "active-play:v1";
export const GAME_DETECTION_POSSIBLE_WINDOW_MS_V1 = 2 * 60 * 1_000;
export const GAME_DETECTION_MULTIPLAYER_WINDOW_MS_V1 = 5 * 60 * 1_000;
export const GAME_DETECTION_SOLO_WINDOW_MS_V1 = 10 * 60 * 1_000;
export const GAME_DETECTION_SUSTAIN_WINDOW_MS_V1 = 5 * 60 * 1_000;
export const GAME_DETECTION_EPISODE_INACTIVITY_MS_V1 = 10 * 60 * 1_000;

export type GameDetectionActivePlayStateV1 =
  | "isolated"
  | "possible"
  | "active"
  | "inactive";

export type GameDetectionActivePlayPathV1 =
  | "multiplayer"
  | "solo"
  | "sustained";

export type GameDetectionActivityFamilyV1 =
  | "d20"
  | "percentile"
  | "fate"
  | "d6-pool"
  | "step-die"
  | "polyhedral"
  | "other";

export type GameDetectionActivePlayEventV1 = Readonly<{
  atMs: number;
  participant: number;
  notation: readonly string[];
}>;

export type GameDetectionActivePlayPriorV1 = Readonly<{
  state: GameDetectionActivePlayStateV1;
  episodeStartedAt: number;
}>;

export type GameDetectionActivePlayRequestV1 = Readonly<{
  version: 1;
  scope: "guild" | "dm";
  nowMs: number;
  prior: GameDetectionActivePlayPriorV1 | null;
  events: readonly GameDetectionActivePlayEventV1[];
}>;

export type GameDetectionActivePlayResultV1 = Readonly<{
  version: 1;
  state: GameDetectionActivePlayStateV1;
  path: GameDetectionActivePlayPathV1 | null;
  episodeStartedAt: number | null;
}>;

const MAX_ACTIVITY_EVENTS = 256;
const MAX_NOTATION_EXPRESSIONS = 10;
const MAX_NOTATION_LENGTH = 1_000;
const MULTIPLAYER_MINIMUM_EVENTS = 4;
const MULTIPLAYER_MINIMUM_PARTICIPANTS = 2;
const MULTIPLAYER_MINIMUM_SPAN_MS = 60 * 1_000;
const SOLO_MINIMUM_EVENTS = 6;
const SOLO_MINIMUM_SPAN_MS = 3 * 60 * 1_000;
const SOLO_REPEATED_FAMILY_MINIMUM = 4;
const SUSTAIN_MINIMUM_EVENTS = 2;
const POSSIBLE_MINIMUM_EVENTS = 2;

const ACTIVE_PLAY_STATES = new Set<GameDetectionActivePlayStateV1>([
  "isolated",
  "possible",
  "active",
  "inactive",
]);
const D20_EXPRESSION = /^(?:\d+)?d20(?:[^d]*)$/u;
const PERCENTILE_EXPRESSION = /^(?:\d+)?d(?:100|%)(?:[^d]*)$/u;
const FATE_EXPRESSION = /^(?:\d+)?df(?:\.[12])?(?:[^d]*)$/u;
const D6_EXPRESSION = /^(?:\d+)?d6(?:[^d]*)$/u;
const MULTIPLE_D6_EXPRESSION = /^(?:[2-9]|[1-9]\d+)d6(?:[^d]*)$/u;
const STANDARD_EXPRESSION = /d(?:4|6|8|10|12|20)(?!\d)/u;
const STEP_EXPRESSION = /d(4|6|8|10|12)(?!\d)/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNotation(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function allMatch(notation: readonly string[], expression: RegExp): boolean {
  return notation.every((value) => expression.test(value));
}

function isStepFamily(notation: readonly string[]): boolean {
  const sides = new Set<string>();
  let exploding = false;
  for (const value of notation) {
    exploding ||= value.includes("!");
    for (const match of value.matchAll(STEP_EXPRESSION)) {
      const side = match[1];
      if (side !== undefined) sides.add(side);
    }
  }
  return sides.size > 0 && (exploding || sides.size > 1);
}

export function classifyGameDetectionActivityFamilyV1(
  notation: readonly string[],
): GameDetectionActivityFamilyV1 {
  if (
    !Array.isArray(notation) ||
    notation.length < 1 ||
    notation.length > MAX_NOTATION_EXPRESSIONS ||
    !notation.every(
      (value) =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= MAX_NOTATION_LENGTH,
    )
  ) {
    throw new Error("Game-detection activity notation is invalid");
  }
  const normalized = notation.map(normalizeNotation);
  if (allMatch(normalized, D20_EXPRESSION)) return "d20";
  if (allMatch(normalized, PERCENTILE_EXPRESSION)) return "percentile";
  if (allMatch(normalized, FATE_EXPRESSION)) return "fate";
  if (isStepFamily(normalized)) return "step-die";
  if (
    allMatch(normalized, D6_EXPRESSION) &&
    normalized.some((value) => MULTIPLE_D6_EXPRESSION.test(value))
  ) {
    return "d6-pool";
  }
  return normalized.every((value) => STANDARD_EXPRESSION.test(value))
    ? "polyhedral"
    : "other";
}

function validateEvents(
  value: unknown,
  nowMs: number,
): readonly GameDetectionActivePlayEventV1[] {
  if (!Array.isArray(value) || value.length > MAX_ACTIVITY_EVENTS) {
    throw new Error("Game-detection activity events are invalid");
  }
  const events = value as readonly unknown[];
  return events.map((event, index) => {
    if (
      !isRecord(event) ||
      Object.keys(event).sort().join(",") !== "atMs,notation,participant" ||
      typeof event.atMs !== "number" ||
      !Number.isSafeInteger(event.atMs) ||
      event.atMs < 0 ||
      event.atMs > nowMs ||
      typeof event.participant !== "number" ||
      !Number.isSafeInteger(event.participant) ||
      event.participant < 0
    ) {
      throw new Error("Game-detection activity event is invalid");
    }
    const prior = events[index - 1];
    if (
      isRecord(prior) &&
      typeof prior.atMs === "number" &&
      event.atMs < prior.atMs
    ) {
      throw new Error("Game-detection activity events must be chronological");
    }
    classifyGameDetectionActivityFamilyV1(event.notation as readonly string[]);
    return event as GameDetectionActivePlayEventV1;
  });
}

function validatePrior(
  value: unknown,
  nowMs: number,
): GameDetectionActivePlayPriorV1 | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== "episodeStartedAt,state" ||
    typeof value.state !== "string" ||
    !ACTIVE_PLAY_STATES.has(value.state as GameDetectionActivePlayStateV1) ||
    typeof value.episodeStartedAt !== "number" ||
    !Number.isSafeInteger(value.episodeStartedAt) ||
    value.episodeStartedAt < 0 ||
    value.episodeStartedAt > nowMs
  ) {
    throw new Error("Game-detection prior activity state is invalid");
  }
  return value as unknown as GameDetectionActivePlayPriorV1;
}

function eventsWithin(
  events: readonly GameDetectionActivePlayEventV1[],
  nowMs: number,
  windowMs: number,
): readonly GameDetectionActivePlayEventV1[] {
  return events.filter(({ atMs }) => nowMs - atMs < windowMs);
}

function eventSpan(events: readonly GameDetectionActivePlayEventV1[]): number {
  const first = events[0];
  const last = events.at(-1);
  return first === undefined || last === undefined ? 0 : last.atMs - first.atMs;
}

function repeatedFamilyCount(
  events: readonly GameDetectionActivePlayEventV1[],
): number {
  const counts = new Map<GameDetectionActivityFamilyV1, number>();
  let maximum = 0;
  for (const event of events) {
    const family = classifyGameDetectionActivityFamilyV1(event.notation);
    const count = (counts.get(family) ?? 0) + 1;
    counts.set(family, count);
    maximum = Math.max(maximum, count);
  }
  return maximum;
}

function currentEpisode(
  events: readonly GameDetectionActivePlayEventV1[],
): readonly GameDetectionActivePlayEventV1[] {
  let start = 0;
  for (let index = 1; index < events.length; index += 1) {
    const prior = events[index - 1];
    const current = events[index];
    if (
      prior !== undefined &&
      current !== undefined &&
      current.atMs - prior.atMs >= GAME_DETECTION_EPISODE_INACTIVITY_MS_V1
    ) {
      start = index;
    }
  }
  return events.slice(start);
}

function result(
  state: GameDetectionActivePlayStateV1,
  path: GameDetectionActivePlayPathV1 | null,
  episodeStartedAt: number | null,
): GameDetectionActivePlayResultV1 {
  return { version: 1, state, path, episodeStartedAt };
}

export function assessGameDetectionActivePlayV1(
  request: GameDetectionActivePlayRequestV1,
): GameDetectionActivePlayResultV1;
export function assessGameDetectionActivePlayV1(
  request: unknown,
): GameDetectionActivePlayResultV1 {
  if (
    !isRecord(request) ||
    Object.keys(request).sort().join(",") !== "events,nowMs,prior,scope,version" ||
    request.version !== 1 ||
    (request.scope !== "guild" && request.scope !== "dm") ||
    typeof request.nowMs !== "number" ||
    !Number.isSafeInteger(request.nowMs) ||
    request.nowMs < 0
  ) {
    throw new Error("Game-detection active-play request is invalid");
  }
  const prior = validatePrior(request.prior, request.nowMs);
  const events = validateEvents(request.events, request.nowMs);
  if (events.length === 0) return result("isolated", null, null);

  const episode = currentEpisode(events);
  const first = episode[0];
  const last = episode.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("Game-detection activity episode is unavailable");
  }
  const derivedStart = first.atMs;
  const observedEpisodeBoundary = episode.length !== events.length;
  const samePriorEpisode =
    prior !== null &&
    prior.state !== "inactive" &&
    prior.episodeStartedAt <= derivedStart &&
    (
      prior.episodeStartedAt === derivedStart ||
      !observedEpisodeBoundary
    );
  const episodeStartedAt = samePriorEpisode
    ? prior.episodeStartedAt
    : derivedStart;

  if (request.nowMs - last.atMs >= GAME_DETECTION_EPISODE_INACTIVITY_MS_V1) {
    return result("inactive", null, episodeStartedAt);
  }

  const multiplayerEvents = eventsWithin(
    episode,
    request.nowMs,
    GAME_DETECTION_MULTIPLAYER_WINDOW_MS_V1,
  );
  const participants = new Set(
    multiplayerEvents.map(({ participant }) => participant),
  );
  if (
    request.scope === "guild" &&
    multiplayerEvents.length >= MULTIPLAYER_MINIMUM_EVENTS &&
    participants.size >= MULTIPLAYER_MINIMUM_PARTICIPANTS &&
    eventSpan(multiplayerEvents) >= MULTIPLAYER_MINIMUM_SPAN_MS
  ) {
    return result("active", "multiplayer", episodeStartedAt);
  }

  const soloEvents = eventsWithin(
    episode,
    request.nowMs,
    GAME_DETECTION_SOLO_WINDOW_MS_V1,
  );
  if (
    soloEvents.length >= SOLO_MINIMUM_EVENTS &&
    new Set(soloEvents.map(({ participant }) => participant)).size === 1 &&
    eventSpan(soloEvents) >= SOLO_MINIMUM_SPAN_MS &&
    repeatedFamilyCount(soloEvents) >= SOLO_REPEATED_FAMILY_MINIMUM
  ) {
    return result("active", "solo", episodeStartedAt);
  }

  const sustainEvents = eventsWithin(
    episode,
    request.nowMs,
    GAME_DETECTION_SUSTAIN_WINDOW_MS_V1,
  );
  if (
    samePriorEpisode &&
    prior.state === "active" &&
    sustainEvents.length >= SUSTAIN_MINIMUM_EVENTS
  ) {
    return result("active", "sustained", episodeStartedAt);
  }

  const possibleEvents = eventsWithin(
    episode,
    request.nowMs,
    GAME_DETECTION_POSSIBLE_WINDOW_MS_V1,
  );
  return possibleEvents.length >= POSSIBLE_MINIMUM_EVENTS
    ? result("possible", null, episodeStartedAt)
    : result("isolated", null, episodeStartedAt);
}
