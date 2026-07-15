import { describe, expect, it } from "vitest";
import {
  GatewayOpcode,
  classifyGatewayClose,
} from "../../packages/gateway-protocol/src";

describe("Discord Gateway protocol constants", () => {
  it("defines every current Discord Gateway opcode", () => {
    expect(GatewayOpcode).toEqual({
      Dispatch: 0,
      Heartbeat: 1,
      Identify: 2,
      PresenceUpdate: 3,
      VoiceStateUpdate: 4,
      Resume: 6,
      Reconnect: 7,
      RequestGuildMembers: 8,
      InvalidSession: 9,
      Hello: 10,
      HeartbeatAck: 11,
      RequestSoundboardSounds: 31,
      RequestChannelInfo: 43,
    });
  });
});

describe("classifyGatewayClose", () => {
  it.each([
    [null, "resume"],
    [1006, "resume"],
    [4000, "resume"],
    [4001, "resume"],
    [4002, "resume"],
    [4003, "resume"],
    [4005, "resume"],
    [4008, "resume"],
    [1000, "identify"],
    [1001, "identify"],
    [4007, "identify"],
    [4009, "identify"],
    [4004, "stop"],
    [4010, "stop"],
    [4011, "stop"],
    [4012, "stop"],
    [4013, "stop"],
    [4014, "stop"],
    [4999, "stop"],
  ] as const)("classifies close code %s as %s", (code, expectedAction) => {
    expect(classifyGatewayClose(code).action).toBe(expectedAction);
  });

  it("invalidates resumable state before identifying or stopping", () => {
    expect(classifyGatewayClose(4007).invalidateSession).toBe(true);
    expect(classifyGatewayClose(4004).invalidateSession).toBe(true);
    expect(classifyGatewayClose(4000).invalidateSession).toBe(false);
  });

  it("fails closed for undocumented close codes", () => {
    expect(classifyGatewayClose(4999)).toEqual({
      action: "stop",
      invalidateSession: true,
      reason: "undocumented-close-code",
    });
  });
});
