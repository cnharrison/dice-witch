import { describe, expect, it } from "vitest";
import { parseGuildLifecycleDispatch } from "../../packages/discord-contracts/src";

const guildId = "100000000000000001";

describe("Discord guild lifecycle Dispatches", () => {
  it("maps GUILD_CREATE to an active guild profile", () => {
    expect(
      parseGuildLifecycleDispatch("GUILD_CREATE", {
        id: guildId,
        name: "Test Guild",
        icon: "guild-icon",
        owner_id: "100000000000000002",
        member_count: 42,
        approximate_member_count: 43,
        preferred_locale: "en-US",
        joined_at: "2026-07-11T20:00:00.000Z",
        unavailable: false,
      }),
    ).toEqual({
      type: "upsert",
      guild: {
        id: guildId,
        name: "Test Guild",
        icon: "guild-icon",
        ownerId: "100000000000000002",
        memberCount: 42,
        approximateMemberCount: 43,
        preferredLocale: "en-US",
        joinedTimestamp: 1_783_800_000_000,
        isActive: true,
      },
    });
  });

  it("routes unavailable creates before requiring a profile", () => {
    expect(
      parseGuildLifecycleDispatch("GUILD_CREATE", {
        id: guildId,
        unavailable: true,
      }),
    ).toEqual({ type: "unavailable", guildId });
  });

  it("distinguishes removal from temporary unavailability", () => {
    expect(
      parseGuildLifecycleDispatch("GUILD_DELETE", {
        id: guildId,
        unavailable: false,
      }),
    ).toEqual({ type: "deactivate", guildId });
    expect(
      parseGuildLifecycleDispatch("GUILD_DELETE", {
        id: guildId,
        unavailable: true,
      }),
    ).toEqual({ type: "unavailable", guildId });
  });

  it("ignores unrelated Dispatches and rejects malformed lifecycle data", () => {
    expect(parseGuildLifecycleDispatch("MESSAGE_CREATE", {})).toBeNull();
    expect(() =>
      parseGuildLifecycleDispatch("GUILD_CREATE", {
        id: "bad",
        name: "Test Guild",
      }),
    ).toThrow("Discord guild lifecycle data is invalid");
    expect(() =>
      parseGuildLifecycleDispatch("GUILD_CREATE", {
        id: guildId,
        name: "Test Guild",
        icon: null,
        owner_id: "100000000000000002",
        member_count: 42,
        preferred_locale: "en-US",
        joined_at: "not-a-timestamp",
      }),
    ).toThrow("Discord guild lifecycle data is invalid");
  });
});
