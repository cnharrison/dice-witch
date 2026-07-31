import { describe, expect, it } from "vitest";
import {
  assessGameDetectionActivePlayV1,
  classifyGameDetectionActivityFamilyV1,
  type GameDetectionActivePlayEventV1,
} from "../../packages/roll-domain/src/game-detection-active-play";

const minute = 60_000;
const now = 20 * minute;

function event(
  ageMs: number,
  participant: number,
  notation = "d20+4",
): GameDetectionActivePlayEventV1 {
  return { atMs: now - ageMs, participant, notation: [notation] };
}

function assess(
  events: readonly GameDetectionActivePlayEventV1[],
  prior: Parameters<typeof assessGameDetectionActivePlayV1>[0]["prior"] = null,
  nowMs = now,
  scope: "guild" | "dm" = "guild",
) {
  return assessGameDetectionActivePlayV1({
    version: 1,
    scope,
    nowMs,
    prior,
    events,
  });
}

describe("game-detection active-play policy", () => {
  it("classifies supported notation families without counting dice quantity", () => {
    expect(classifyGameDetectionActivityFamilyV1(["3d20"])).toBe("d20");
    expect(classifyGameDetectionActivityFamilyV1(["d100<45"])).toBe("percentile");
    expect(classifyGameDetectionActivityFamilyV1(["4dF+2"])).toBe("fate");
    expect(classifyGameDetectionActivityFamilyV1(["8d6"])).toBe("d6-pool");
    expect(classifyGameDetectionActivityFamilyV1(["d8!"])).toBe("step-die");
    expect(classifyGameDetectionActivityFamilyV1(["6d8"])).toBe("polyhedral");
    expect(classifyGameDetectionActivityFamilyV1(["d20", "2d6"])).toBe(
      "polyhedral",
    );
    expect(classifyGameDetectionActivityFamilyV1(["sqrt(4d10/3)"])).toBe(
      "polyhedral",
    );
    expect(classifyGameDetectionActivityFamilyV1(["2+2"])).toBe("other");
  });

  it("rejects a future episode identity", () => {
    expect(() => assess(
      [event(0, 0)],
      { state: "active", episodeStartedAt: now + 1 },
    )).toThrow("Game-detection prior activity state is invalid");
  });

  it("keeps one roll isolated and two recent rolls merely possible", () => {
    expect(assess([event(0, 0)])).toMatchObject({
      state: "isolated",
      path: null,
    });
    expect(assess([event(minute, 0), event(0, 0)])).toMatchObject({
      state: "possible",
      path: null,
    });
  });

  it("excludes events exactly on the possible-window boundary", () => {
    expect(assess([event(2 * minute, 0), event(0, 0)])).toMatchObject({
      state: "isolated",
      path: null,
    });
  });

  it("requires four rolls, two participants, and a sixty-second span for multiplayer", () => {
    const qualifying = [
      event(4 * minute, 0),
      event(3 * minute, 0),
      event(minute, 0),
      event(0, 1),
    ];
    expect(assess(qualifying)).toMatchObject({
      state: "active",
      path: "multiplayer",
    });
    expect(assess(qualifying.map((item, index) => ({
      ...item,
      atMs: now - (3 - index) * 10_000,
    })))).toMatchObject({ state: "possible", path: null });
    expect(assess(qualifying.map((item) => ({ ...item, participant: 0 })))).toMatchObject({
      state: "possible",
      path: null,
    });
  });

  it("does not allow a DM to qualify through multiplayer activity", () => {
    const multiplayer = [
      event(4 * minute, 0),
      event(3 * minute, 0),
      event(minute, 1),
      event(0, 1),
    ];
    expect(assess(multiplayer, null, now, "dm")).toMatchObject({
      state: "possible",
      path: null,
    });
    expect(assess([
      event(9 * minute, 0, "d10+1"),
      event(7 * minute, 0, "d10+2"),
      event(5 * minute, 0, "d10+3"),
      event(3 * minute, 0, "d10+4"),
      event(minute, 0, "d6"),
      event(0, 0, "d8"),
    ], null, now, "dm")).toMatchObject({ state: "active", path: "solo" });
  });

  it("uses an inclusive minimum span and exclusive multiplayer window", () => {
    expect(assess([
      event(minute, 0),
      event(40_000, 0),
      event(20_000, 1),
      event(0, 1),
    ])).toMatchObject({ state: "active", path: "multiplayer" });
    expect(assess([
      event(5 * minute, 0),
      event(3 * minute, 0),
      event(minute, 1),
      event(0, 1),
    ])).toMatchObject({ state: "possible", path: null });
  });

  it("requires sustained repeated-family evidence for solo play", () => {
    const qualifying = [
      event(9 * minute, 0, "d10+2"),
      event(7 * minute, 0, "d10+3"),
      event(5 * minute, 0, "d10+4"),
      event(3 * minute, 0, "d10+5"),
      event(minute, 0, "d6"),
      event(0, 0, "d8"),
    ];
    expect(assess(qualifying)).toMatchObject({
      state: "active",
      path: "solo",
    });
    expect(assess(qualifying.map((item, index) => ({
      ...item,
      atMs: now - (5 - index) * 20_000,
    })))).toMatchObject({ state: "possible", path: null });
    const diverseFamilies = [
      "d20+4",
      "d100<50",
      "4dF",
      "8d6",
      "d8!",
      "6d8",
    ];
    expect(assess(qualifying.map((item, index) => {
      const notation = diverseFamilies[index];
      if (notation === undefined) throw new Error("Missing notation family");
      return { ...item, notation: [notation] };
    }))).toMatchObject({ state: "possible", path: null });
  });

  it("uses an inclusive solo span and exclusive solo window", () => {
    expect(assess([
      event(3 * minute, 0, "d10+1"),
      event(150_000, 0, "d10+2"),
      event(2 * minute, 0, "d10+3"),
      event(90_000, 0, "d10+4"),
      event(minute, 0, "d6"),
      event(0, 0, "d8"),
    ])).toMatchObject({ state: "active", path: "solo" });
    expect(assess([
      event(10 * minute, 0, "d10+1"),
      event(8 * minute, 0, "d10+2"),
      event(6 * minute, 0, "d10+3"),
      event(4 * minute, 0, "d10+4"),
      event(2 * minute, 0, "d6"),
      event(0, 0, "d8"),
    ])).toMatchObject({ state: "isolated", path: null });
  });

  it("sustains an active episode with two rolls in five minutes", () => {
    const episodeStartedAt = now - 8 * minute;
    expect(assess(
      [event(4 * minute, 0), event(0, 0)],
      { state: "active", episodeStartedAt },
    )).toMatchObject({
      state: "active",
      path: "sustained",
      episodeStartedAt,
    });
  });

  it("preserves the episode identity when stored history is bounded", () => {
    const episodeStartedAt = now - 15 * minute;
    expect(assess(
      [event(4 * minute, 0), event(0, 0)],
      { state: "active", episodeStartedAt },
    )).toMatchObject({
      state: "active",
      path: "sustained",
      episodeStartedAt,
    });
  });

  it("excludes an event exactly on the sustain-window boundary", () => {
    const episodeStartedAt = now - 8 * minute;
    expect(assess(
      [event(5 * minute, 0), event(0, 0)],
      { state: "active", episodeStartedAt },
    )).toMatchObject({ state: "isolated", path: null });
  });

  it("ends an episode at exactly ten minutes of inactivity", () => {
    const episodeStartedAt = now - 20 * minute;
    expect(assess(
      [event(10 * minute, 0)],
      { state: "active", episodeStartedAt },
    )).toMatchObject({
      state: "inactive",
      path: null,
    });
  });

  it("does not carry an inactive episode into newly observed activity", () => {
    const latest = event(0, 0);
    expect(assess(
      [latest],
      { state: "inactive", episodeStartedAt: now - 20 * minute },
    )).toMatchObject({
      state: "isolated",
      path: null,
      episodeStartedAt: latest.atMs,
    });
  });

  it("starts a new episode after a ten-minute inter-roll gap", () => {
    const events = [
      { atMs: now - 15 * minute, participant: 0, notation: ["3d20"] },
      event(4 * minute, 0, "d10+2"),
      event(3 * minute, 0, "d10+3"),
      event(2 * minute, 0, "d10+4"),
      event(minute, 0, "d10+5"),
      event(30_000, 0, "d6"),
      event(0, 0, "d8"),
    ];
    const priorEpisode = events[0];
    const currentEpisode = events[1];
    if (priorEpisode === undefined || currentEpisode === undefined) {
      throw new Error("Missing episode fixture");
    }
    const result = assess(events, {
      state: "active",
      episodeStartedAt: priorEpisode.atMs,
    });
    expect(result).toMatchObject({
      state: "active",
      path: "solo",
      episodeStartedAt: currentEpisode.atMs,
    });
  });
});
