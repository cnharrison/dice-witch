import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  LOG_WORK_RETENTION_MS,
  LOG_WORK_RETRY_WINDOW_MS,
  MAX_LOG_ARTIFACT_PNG_BYTES,
  imageUnavailableLogArtifact,
  storedLogArtifact,
  validateRollLogArtifact,
  type RollLogArtifactV1,
  type RollLogArtifactV2,
} from "../../packages/discord-contracts/src";

const LogicalShardSchema = z.union([
  z.strictObject({
    status: z.literal("available"),
    shardId: z.number(),
    shardCount: z.number(),
    generation: z.number(),
  }),
  z.strictObject({ status: z.literal("unavailable") }),
  z.null(),
]);
const TelemetryContextFields = {
  telemetryVersion: z.literal(2),
  level: z.enum(["info", "warn", "error"]),
  subsystem: z.literal("private-roll-log"),
  rollId: z.string(),
  interactionId: z.string(),
  source: z.enum(["discord", "web"]),
  notation: z.string(),
  userId: z.string(),
  username: z.string(),
  guildId: z.string().nullable(),
  channelId: z.string(),
  context: z.json().nullable(),
  guildName: z.string().nullable(),
  channelName: z.string().nullable(),
  channelType: z.number().nullable(),
  title: z.string().nullable(),
  destinationPayload: z.json(),
  destinationDeliveredAt: z.number(),
  imageStatus: z.enum(["available", "unavailable"]),
  imageFilename: z.string().nullable(),
  imageUnavailableReason: z.string().nullable(),
  logicalShard: LogicalShardSchema,
  userImpact: z.literal("none"),
};
const TelemetryEventSchema = z.discriminatedUnion("message", [
  z.strictObject({
    ...TelemetryContextFields,
    message: z.literal("Private roll log delivery will retry"),
    state: z.literal("pending"),
    failureKind: z.literal("discord-retryable"),
    attempt: z.number(),
    httpStatus: z.number(),
    retryAfterMs: z.number().nullable(),
  }),
  z.strictObject({
    ...TelemetryContextFields,
    message: z.literal("Private roll log delivery completed"),
    state: z.enum(["delivered", "failed"]),
    attempts: z.number(),
    httpStatus: z.number(),
    elapsedMs: z.number(),
    imageSha256: z.string().nullable(),
  }),
]);

function parseTelemetryEvent(value: string) {
  return TelemetryEventSchema.parse(JSON.parse(value));
}

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function crc32(value: Uint8Array, start: number, end: number): number {
  let crc = 0xffff_ffff;
  for (let index = start; index < end; index += 1) {
    crc ^= value[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngWithByteLength(byteLength: number): Uint8Array {
  const iendBytes = 12;
  const chunkBytes = byteLength - PNG.byteLength;
  const dataBytes = chunkBytes - 12;
  if (dataBytes < 0) throw new Error("Requested PNG is too small");
  const result = new Uint8Array(byteLength);
  const iendOffset = PNG.byteLength - iendBytes;
  result.set(PNG.subarray(0, iendOffset));
  writeUint32(result, iendOffset, dataBytes);
  const typeOffset = iendOffset + 4;
  result.set([116, 69, 88, 116], typeOffset);
  const crcOffset = typeOffset + 4 + dataBytes;
  writeUint32(result, crcOffset, crc32(result, typeOffset, crcOffset));
  result.set(PNG.subarray(iendOffset), crcOffset + 4);
  return result;
}

function artifact(
  overrides: Partial<RollLogArtifactV1> = {},
): RollLogArtifactV1 {
  return {
    version: 1,
    rollId: "1400000000000000001",
    source: "discord",
    notation: "1d20",
    user: { id: "100000000000000002", username: "roller" },
    guildId: "100000000000000003",
    channelId: "100000000000000010",
    context: {
      kind: "guild",
      guildId: "100000000000000003",
      guildName: "Fixture Guild",
      channelId: "100000000000000010",
      channelName: "dice-rolls",
      channelType: 0,
    },
    destinationDeliveredAt: 1_750_000_000_000,
    payload: {
      embeds: [
        {
          description: "[20] = 20",
          image: { url: "attachment://dice-1400000000000000001.png" },
        },
      ],
    },
    image: {
      status: "available",
      filename: "dice-1400000000000000001.png",
      png: PNG,
    },
    ...overrides,
  };
}

function artifactV2(
  overrides: Partial<RollLogArtifactV2> = {},
): RollLogArtifactV2 {
  const rollId = "1400000000000000020";
  const filename = `dice-${rollId}.png`;
  return {
    version: 2,
    rollId,
    source: "discord",
    notation: "1d20",
    user: { id: "100000000000000002", username: "roller" },
    guildId: null,
    channelId: "100000000000000010",
    context: { kind: "dm", channelId: "100000000000000010" },
    destinationDeliveredAt: 1_750_000_000_000,
    presentation: { title: "Initiative", result: "[20] = 20", savedRoll: null },
    payload: {
      flags: 1 << 15,
      components: [
        {
          type: 17,
          components: [
            { type: 10, content: "[20] = 20" },
            {
              type: 12,
              items: [{ media: { url: `attachment://${filename}` } }],
            },
            { type: 14 },
          ],
        },
      ],
    },
    image: { status: "available", filename, png: PNG },
    ...overrides,
  };
}

function logWork(name: string) {
  return env.LOG_WORK.getByName(name);
}

async function callAlarm(instance: {
  alarm?: () => void | Promise<void>;
}): Promise<void> {
  if (instance.alarm === undefined) throw new Error("LogWork alarm is missing");
  await instance.alarm();
}

describe("LogWork Durable Object", () => {
  it("persists one byte-identical PNG artifact across replay and eviction", async () => {
    const stub = logWork("1400000000000000001");
    const input = artifact();

    const first = await stub.accept(input);
    const replay = await stub.accept(input);

    expect(first).toMatchObject({ status: "created", state: "pending" });
    if (first.status === "conflict") throw new Error("Log artifact conflicted");
    expect(first.retryUntil - first.acceptedAt).toBe(
      LOG_WORK_RETRY_WINDOW_MS,
    );
    expect(first.expiresAt - first.retryUntil).toBe(LOG_WORK_RETENTION_MS);
    expect(replay).toEqual({ ...first, status: "existing" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ image_bytes: ArrayBuffer }>(
          "SELECT image_bytes FROM log_artifact WHERE singleton = 1",
        )
        .one();
      expect(new Uint8Array(row.image_bytes)).toEqual(PNG);
    });

    await evictDurableObject(stub);
    const status = await stub.artifactStatus();
    expect(status).toMatchObject({
      state: "pending",
      imageStatus: "available",
      imageBytes: PNG.byteLength,
      attempts: 0,
      lastHttpStatus: null,
    });
    if (status.state === "missing") throw new Error("Log artifact is missing");
    expect(status.imageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an artifact whose roll identity does not match its object", async () => {
    const stub = logWork("1400000000000000016");
    await expect(
      stub.accept(artifact({ rollId: "1400000000000000017" })),
    ).resolves.toEqual({ status: "conflict" });
    await expect(stub.artifactStatus()).resolves.toEqual({ state: "missing" });
  });

  it("rejects a conflicting artifact for the same durable roll identity", async () => {
    const stub = logWork("1400000000000000002");
    const input = artifact({ rollId: "1400000000000000002" });

    await expect(stub.accept(input)).resolves.toMatchObject({
      status: "created",
    });
    await expect(
      stub.accept({ ...input, notation: "2d20" }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("rejects malformed payloads plus corrupt and oversized PNGs", () => {
    const corrupt = artifact({
      rollId: "1400000000000000003",
      image: {
        status: "available",
        filename: "dice-1400000000000000003.png",
        png: new Uint8Array([1, 2, 3]),
      },
      payload: {
        content: "attachment://dice-1400000000000000003.png",
      },
    });
    const oversized = artifact({
      rollId: "1400000000000000004",
      image: {
        status: "available",
        filename: "dice-1400000000000000004.png",
        png: new Uint8Array(MAX_LOG_ARTIFACT_PNG_BYTES + 1),
      },
      payload: {
        content: "attachment://dice-1400000000000000004.png",
      },
    });

    expect(() =>
      validateRollLogArtifact(
        artifact({
          rollId: "1400000000000000007",
          payload: {
            embeds: [
              {
                description: "1d20 = 10",
                image: {
                  url: "attachment://dice-1400000000000000001.png",
                },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 2,
                    label: "Copy to Personal",
                    custom_id: "saved-roll:v1:1400000000000000007:copy",
                  },
                ],
              },
            ],
          },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateRollLogArtifact({
        ...artifact({ rollId: "1400000000000000006" }),
        payload: { bogus: "attachment://dice-1400000000000000006.png" },
      }),
    ).toThrow("Roll log artifact payload is invalid");
    expect(() => validateRollLogArtifact(corrupt)).toThrow(
      "Roll log artifact image is invalid",
    );
    expect(() => validateRollLogArtifact(oversized)).toThrow(
      "Roll log artifact image is invalid",
    );
    expect(() =>
      validateRollLogArtifact(
        artifact({
          rollId: "1400000000000000006",
          payload: {
            embeds: [
              {
                title: "x".repeat(256),
                description: "x".repeat(4_096),
                footer: { text: "x".repeat(2_048) },
                image: {
                  url: "attachment://dice-1400000000000000001.png",
                },
              },
            ],
          },
        }),
      ),
    ).toThrow("Roll log artifact embeds exceed Discord's aggregate limit");
  });

  it("validates PNG structure in signature, chunk, and CRC order", () => {
    const badSignature = PNG.slice();
    badSignature[0] = 0;
    const truncatedChunk = PNG.slice(0, PNG.byteLength - 1);
    const badCrc = PNG.slice();
    const finalByte = badCrc.length - 1;
    badCrc[finalByte] = (badCrc[finalByte] ?? 0) ^ 1;

    for (const [rollId, png] of [
      ["1400000000000000021", badSignature],
      ["1400000000000000022", truncatedChunk],
      ["1400000000000000023", badCrc],
    ] as const) {
      expect(() =>
        validateRollLogArtifact(artifact({
          rollId,
          payload: {
            embeds: [{ image: { url: `attachment://dice-${rollId}.png` } }],
          },
          image: { status: "available", filename: `dice-${rollId}.png`, png },
        })),
      ).toThrow("Roll log artifact image is invalid");
    }
  });

  it("round-trips V2 storage and places the image-unavailable marker", async () => {
    const inputPng = PNG.slice();
    const input = artifactV2({
      image: {
        status: "available",
        filename: "dice-1400000000000000020.png",
        png: inputPng,
      },
    });
    const validated = validateRollLogArtifact(input);
    expect(validated.version).toBe(2);
    expect(validated.image.status).toBe("available");
    if (validated.image.status !== "available") {
      throw new Error("Validated image is unavailable");
    }
    expect(validated.image.png).not.toBe(inputPng);
    expect(validated.image.png).toEqual(inputPng);

    const stored = await storedLogArtifact(validated);
    expect(stored.artifact.version).toBe(2);
    expect(stored.artifact.payload).toEqual(validated.payload);
    expect(stored.identity).toBe(JSON.stringify(stored.artifact));
    expect(stored.png).toBe(validated.image.png);
    expect(stored.artifact.image).toMatchObject({
      status: "available",
      bytes: PNG.byteLength,
    });
    if (stored.artifact.image.status !== "available") {
      throw new Error("Stored image is unavailable");
    }
    expect(stored.artifact.image.sha256).toMatch(/^[0-9a-f]{64}$/);

    const unavailable = imageUnavailableLogArtifact(input, "discord-rejected");
    expect(unavailable.version).toBe(2);
    if (unavailable.version !== 2) throw new Error("V2 artifact changed version");
    expect(unavailable.image).toEqual({
      status: "unavailable",
      reason: "discord-rejected",
    });
    expect(unavailable.payload.components).toEqual([
      {
        type: 17,
        components: [
          { type: 10, content: "[20] = 20" },
          { type: 10, content: "**image unavailable**" },
          { type: 14 },
        ],
      },
    ]);
  });

  it("enforces V2 image agreement and the exact artifact JSON byte limit", () => {
    expect(() =>
      validateRollLogArtifact(artifactV2({
        image: { status: "unavailable", reason: "missing" },
      })),
    ).toThrow("Roll log artifact payload does not match its image");

    const components = Array.from(
      { length: 31 },
      () => ({ type: 10 as const, content: "x".repeat(4_000) }),
    );
    const payloadWithEmptyTail = {
      flags: 1 << 15,
      components: [...components, { type: 10 as const, content: "" }],
    };
    const remainingBytes = 128_000 - JSON.stringify(payloadWithEmptyTail).length;
    const exactPayload = {
      ...payloadWithEmptyTail,
      components: [
        ...components,
        { type: 10 as const, content: "x".repeat(remainingBytes) },
      ],
    };
    const withoutImage = artifactV2({
      payload: exactPayload,
      image: { status: "unavailable", reason: "not-applicable" },
    });

    expect(JSON.stringify(exactPayload)).toHaveLength(128_000);
    expect(() => validateRollLogArtifact(withoutImage)).not.toThrow();
    expect(() =>
      validateRollLogArtifact({
        ...withoutImage,
        payload: {
          ...exactPayload,
          components: [
            ...components,
            { type: 10, content: `${"x".repeat(remainingBytes)}x` },
          ],
        },
      }),
    ).toThrow("Roll log artifact payload is invalid");
  });

  it("stores the maximum permitted PNG below the SQLite row limit", async () => {
    const rollId = "1400000000000000007";
    const png = pngWithByteLength(MAX_LOG_ARTIFACT_PNG_BYTES);
    const input = artifact({
      rollId,
      payload: {
        embeds: [
          { image: { url: `attachment://dice-${rollId}.png` } },
        ],
      },
      image: { status: "available", filename: `dice-${rollId}.png`, png },
    });
    const stub = logWork(rollId);

    await expect(stub.accept(input)).resolves.toMatchObject({
      status: "created",
    });
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      imageBytes: MAX_LOG_ARTIFACT_PNG_BYTES,
    });
  });

  it("delivers asynchronously and deletes terminal PNG bytes", async () => {
    const rollId = "1400000000000000008";
    const stub = logWork(rollId);

    await stub.accept(artifact({ rollId }));
    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    const status = await stub.artifactStatus();
    expect(status).toMatchObject({
      state: "delivered",
      attempts: 1,
      lastHttpStatus: 200,
    });
    if (status.state === "missing") throw new Error("Log artifact is missing");
    expect(status.completedAt).toEqual(expect.any(Number));
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ image_bytes: ArrayBuffer | null }>(
          "SELECT image_bytes FROM log_artifact WHERE singleton = 1",
        )
        .one();
      expect(row.image_bytes).toBeNull();
    });
  });

  it("honors a retryable Discord result without duplicating acceptance", async () => {
    const rollId = "1400000000000000009";
    const stub = logWork(rollId);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      await stub.accept(
        artifact({
          rollId,
          user: { id: "100000000000000002", username: "log-retry" },
        }),
      );
      await runDurableObjectAlarm(stub);
      await expect(stub.artifactStatus()).resolves.toMatchObject({
        state: "pending",
        attempts: 1,
        lastHttpStatus: 429,
      });
      await runDurableObjectAlarm(stub);
      await expect(stub.artifactStatus()).resolves.toMatchObject({
        state: "delivered",
        attempts: 2,
        lastHttpStatus: 200,
      });

      const retry = consoleWarn.mock.calls
        .map(([entry]) => parseTelemetryEvent(String(entry)))
        .find(({ message }) => message === "Private roll log delivery will retry");
      expect(retry).toMatchObject({
        telemetryVersion: 2,
        subsystem: "private-roll-log",
        rollId,
        source: "discord",
        notation: "1d20",
        userId: "100000000000000002",
        username: "log-retry",
        guildId: "100000000000000003",
        channelId: "100000000000000010",
        guildName: "Fixture Guild",
        channelName: "dice-rolls",
        channelType: 0,
        title: null,
        destinationDeliveredAt: 1_750_000_000_000,
        logicalShard: {
          status: "available",
          shardId: 2,
          shardCount: 4,
          generation: 16,
        },
        state: "pending",
        userImpact: "none",
        attempt: 1,
        httpStatus: 429,
      });
      expect(retry?.destinationPayload).toEqual({
        embeds: [
          {
            description: "[20] = 20",
            image: {
              url: "attachment://dice-1400000000000000001.png",
            },
          },
        ],
      });
      const completed = consoleInfo.mock.calls
        .map(([entry]) => parseTelemetryEvent(String(entry)))
        .find(({ message }) => message === "Private roll log delivery completed");
      if (completed?.message !== "Private roll log delivery completed") {
        throw new Error("Completed private roll telemetry event is missing");
      }
      expect(completed).toMatchObject({
        telemetryVersion: 2,
        subsystem: "private-roll-log",
        rollId,
        source: "discord",
        notation: "1d20",
        userId: "100000000000000002",
        username: "log-retry",
        guildName: "Fixture Guild",
        channelName: "dice-rolls",
        logicalShard: {
          status: "available",
          shardId: 2,
          shardCount: 4,
          generation: 16,
        },
        state: "delivered",
        userImpact: "none",
        attempts: 2,
        httpStatus: 200,
      });
      expect(completed.destinationPayload).toEqual(retry?.destinationPayload);
      expect(completed.imageSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify([retry, completed])).not.toMatch(
        /fixture\.bot\.token|interaction-token|image_bytes/i,
      );
      expect(completed).not.toHaveProperty("imageBytes");
    } finally {
      consoleWarn.mockRestore();
      consoleInfo.mockRestore();
    }
  });

  it("retries an image-specific rejection as explicit full text", async () => {
    const rollId = "1400000000000000010";
    const stub = logWork(rollId);

    await stub.accept(
      artifact({
        rollId,
        user: {
          id: "100000000000000002",
          username: "log-image-rejected",
        },
        payload: {
          content: "x".repeat(2_000),
          embeds: [
            {
              image: {
                url: "attachment://dice-1400000000000000001.png",
              },
            },
          ],
        },
      }),
    );
    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 1,
      lastHttpStatus: 400,
      imageStatus: "unavailable",
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "delivered",
      attempts: 2,
      lastHttpStatus: 200,
      imageStatus: "unavailable",
    });
  });

  it("reserves one final text-only send when attempt twelve rejects the image", async () => {
    const rollId = "1400000000000000015";
    const stub = logWork(rollId);
    await stub.accept(
      artifact({
        rollId,
        user: {
          id: "100000000000000002",
          username: "log-image-rejected",
        },
      }),
    );
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE log_artifact SET attempts = 11 WHERE singleton = 1",
      );
    });

    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 12,
      imageStatus: "unavailable",
      lastHttpStatus: 400,
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "delivered",
      attempts: 13,
      imageStatus: "unavailable",
      lastHttpStatus: 200,
    });
  });

  it("retries image rejection when the atomic fallback commit is interrupted", async () => {
    const rollId = "1400000000000000018";
    const stub = logWork(rollId);
    await stub.accept(
      artifact({
        rollId,
        user: {
          id: "100000000000000002",
          username: "log-image-rejected",
        },
      }),
    );
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE log_artifact SET attempts = 11 WHERE singleton = 1",
      );
      state.storage.sql.exec(`
        CREATE TRIGGER fail_fallback_commit
        BEFORE UPDATE OF artifact_json ON log_artifact
        BEGIN
          SELECT RAISE(ABORT, 'simulated fallback commit failure');
        END;
      `);
    });

    await runInDurableObject(stub, async (instance) => {
      await expect(callAlarm(instance)).rejects.toThrow(
        "simulated fallback commit failure",
      );
    });
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 11,
      imageStatus: "available",
    });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DROP TRIGGER fail_fallback_commit");
    });

    await runInDurableObject(stub, async (instance) => callAlarm(instance));
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 12,
      imageStatus: "unavailable",
    });
    await runInDurableObject(stub, async (instance) => callAlarm(instance));
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "delivered",
      attempts: 13,
      imageStatus: "unavailable",
    });
  });

  it("stops a general Discord outage after twelve delivery attempts", async () => {
    const rollId = "1400000000000000013";
    const stub = logWork(rollId);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await stub.accept(
        artifact({
          rollId,
          user: { id: "100000000000000002", username: "log-outage" },
        }),
      );

      for (let attempt = 0; attempt < 13; attempt += 1) {
        await runDurableObjectAlarm(stub);
      }
      await expect(stub.artifactStatus()).resolves.toMatchObject({
        state: "failed",
        attempts: 12,
        lastHttpStatus: 503,
        imageBytes: 0,
      });
      const completed = consoleError.mock.calls
        .map(([entry]) => parseTelemetryEvent(String(entry)))
        .find(({ message }) => message === "Private roll log delivery completed");
      expect(completed).toMatchObject({
        telemetryVersion: 2,
        subsystem: "private-roll-log",
        rollId,
        notation: "1d20",
        username: "log-outage",
        guildName: "Fixture Guild",
        channelName: "dice-rolls",
        state: "failed",
        userImpact: "none",
        attempts: 12,
        httpStatus: 503,
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("fails pending delivery when its six-hour retry window expires", async () => {
    const rollId = "1400000000000000014";
    const stub = logWork(rollId);
    await stub.accept(artifact({ rollId }));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE log_artifact
         SET accepted_at = 0, retry_until = 0,
             expires_at = ?
         WHERE singleton = 1`,
        LOG_WORK_RETENTION_MS,
      );
    });

    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "failed",
      attempts: 0,
      imageBytes: 0,
    });
  });

  it("keeps the complete log when logical shard resolution is unavailable", async () => {
    const rollId = "1400000000000000011";
    const stub = logWork(rollId);

    await stub.accept(
      artifact({
        rollId,
        guildId: "100000000000000099",
        context: null,
        user: {
          id: "100000000000000002",
          username: "log-shard-unavailable",
        },
      }),
    );
    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      state: "delivered",
      attempts: 1,
    });
  });

  it("deletes terminal status after its retention deadline", async () => {
    const rollId = "1400000000000000012";
    const stub = logWork(rollId);
    await stub.accept(artifact({ rollId }));
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE log_artifact
         SET state = 'delivered', accepted_at = 0, retry_until = 0,
             completed_at = 1, expires_at = 1, image_bytes = NULL
         WHERE singleton = 1`,
      );
      await state.storage.setAlarm(1);
    });

    await runDurableObjectAlarm(stub);
    await expect(stub.artifactStatus()).resolves.toEqual({ state: "missing" });
  });

  it("accepts an explicit full-text image-unavailable artifact", async () => {
    const input = artifact({
      rollId: "1400000000000000005",
      payload: { content: "[20] = 20\n\n**image unavailable**" },
      image: { status: "unavailable", reason: "oversized" },
    });
    const stub = logWork(input.rollId);

    await expect(stub.accept(input)).resolves.toMatchObject({
      status: "created",
      state: "pending",
    });
    await expect(stub.artifactStatus()).resolves.toMatchObject({
      imageStatus: "unavailable",
      imageBytes: 0,
      imageSha256: null,
    });
  });
});
