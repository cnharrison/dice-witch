import { describe, expect, it } from "vitest";
import {
  buildRollDeliveryPayload,
  type RollInteraction,
} from "../../packages/discord-contracts/src";

const interaction = {
  id: "1400000000000000000",
  applicationId: "100000000000000001",
  guildId: "100000000000000002",
  channelId: "1400000000000000002",
  loggingContext: null,
  userId: "1400000000000000003",
  username: "roller",
  token: "interaction-token-value",
  notation: "1d20",
  title: null,
  repetitions: 1,
  ephemeral: true,
} satisfies RollInteraction;

const receivedAt = 1_753_856_410_742;
const deferredAt = receivedAt + 8;

type TelemetryOverrides = {
  version?: number;
  handlerStartedAt?: number;
  acknowledgementPreparedAt?: number;
  acknowledgementType?: number;
  extra?: boolean;
};

function telemetry(overrides: TelemetryOverrides = {}) {
  return {
    version: 2,
    handlerStartedAt: receivedAt,
    acknowledgementPreparedAt: deferredAt,
    acknowledgementType: 5,
    ...overrides,
  };
}

describe("buildRollDeliveryPayload", () => {
  it("derives receive time from the interaction Snowflake and omits absent fields", () => {
    const payload = buildRollDeliveryPayload(
      interaction,
      deferredAt,
      0,
      null,
    );

    expect(payload.accounting.receivedAt).toBe(receivedAt);
    expect(payload.rollSeed).toBe(0);
    expect(payload).not.toHaveProperty("telemetry");
    expect(payload).not.toHaveProperty("renderSeed");
    expect(payload).not.toHaveProperty("clatter");
    expect(payload.logging).not.toHaveProperty("context");
  });

  it("retains telemetry boundary times and explicit zero-valued seeds", () => {
    const payload = buildRollDeliveryPayload(
      interaction,
      deferredAt,
      0xffff_ffff,
      telemetry({ handlerStartedAt: deferredAt }),
      { renderSeed: 0, deliveredAt: 1 },
    );

    expect(payload.telemetry).toEqual({
      version: 2,
      handlerStartedAt: deferredAt,
      acknowledgementPreparedAt: deferredAt,
      acknowledgementType: 5,
    });
    expect(payload).toMatchObject({
      rollSeed: 0xffff_ffff,
      renderSeed: 0,
      clatter: { deliveredAt: 1 },
    });
  });

  it.each([
    telemetry({ handlerStartedAt: receivedAt - 1 }),
    telemetry({ handlerStartedAt: deferredAt + 1 }),
    telemetry({ acknowledgementPreparedAt: deferredAt - 1 }),
    telemetry({ acknowledgementType: 7 }),
    telemetry({ extra: true }),
  ])("rejects telemetry outside its contract %#", (value) => {
    expect(() =>
      buildRollDeliveryPayload(interaction, deferredAt, 1, value)
    ).toThrow("Roll delivery telemetry is invalid");
  });

  it.each([
    { renderSeed: -1, deliveredAt: 1 },
    { renderSeed: 0x1_0000_0000, deliveredAt: 1 },
    { renderSeed: 1, deliveredAt: 0 },
    { renderSeed: 1, deliveredAt: 1, extra: true },
  ])("rejects invalid clatter acknowledgement %#", (acknowledgement) => {
    expect(() =>
      buildRollDeliveryPayload(
        interaction,
        deferredAt,
        1,
        null,
        acknowledgement,
      )
    ).toThrow("Roll delivery clatter acknowledgement is invalid");
  });

  it("preserves seed, clatter, then telemetry error precedence", () => {
    expect(() =>
      buildRollDeliveryPayload(
        interaction,
        deferredAt,
        -1,
        {},
        { renderSeed: -1, deliveredAt: 0 },
      )
    ).toThrow("Roll delivery seed is invalid");
    expect(() =>
      buildRollDeliveryPayload(
        interaction,
        deferredAt,
        1,
        {},
        { renderSeed: -1, deliveredAt: 0 },
      )
    ).toThrow("Roll delivery clatter acknowledgement is invalid");
  });
});
