import { describe, expect, it } from "vitest";
import {
  MUTUAL_GUILDS_QUERY_KEY,
  parseGuildChannels,
  parseMutualGuilds,
  parseRollerGuilds,
} from "./guilds";

const membership = {
  guilds: {
    id: "100000000000000001",
    name: "Fixture guild",
    icon: null,
  },
  isAdmin: true,
  isDiceWitchAdmin: false,
};

describe("guild API contracts", () => {
  it("parses one shared mutual-guild cache shape", () => {
    expect(MUTUAL_GUILDS_QUERY_KEY).toEqual(["guilds"]);
    expect(parseMutualGuilds({ guilds: [membership] })).toEqual([membership]);
  });

  it("parses roller memberships and text channels", () => {
    expect(
      parseRollerGuilds({
        guilds: [{ ...membership, isRollable: true }],
      }),
    ).toEqual([{ ...membership, isRollable: true }]);
    expect(
      parseGuildChannels({
        channels: [
          { id: "100000000000000010", name: "general", type: 0 },
          { id: "100000000000000011", name: "news", type: 5 },
        ],
      }),
    ).toHaveLength(2);
  });

  it.each([
    { guilds: [{ ...membership, unexpected: true }] },
    { guilds: [{ ...membership, guilds: { ...membership.guilds, id: "bad" } }] },
    { guilds: [{ ...membership, isAdmin: "yes" }] },
  ])("rejects malformed guild responses", (value) => {
    expect(() => parseMutualGuilds(value)).toThrow("Guild response is invalid");
  });

  it("rejects malformed channel responses", () => {
    expect(() =>
      parseGuildChannels({
        channels: [
          { id: "100000000000000010", name: "voice", type: 2 },
        ],
      }),
    ).toThrow("Guild channels response is invalid");
  });
});
