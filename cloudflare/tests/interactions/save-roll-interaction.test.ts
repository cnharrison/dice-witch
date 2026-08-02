import { describe, expect, it, vi } from "vitest";
import {
  buildSaveRollCustomId,
  buildSaveRollDuplicateResponse,
  buildSaveRollErrorResponse,
  buildSaveRollModalResponse,
  buildSaveRollSuccessResponse,
  parseSaveRollInteraction,
  parseSaveRollIntent,
  parseSaveRollIntentV1,
  ROLL_SAVE_INTENT_RETENTION_MS,
} from "../../packages/discord-contracts/src";
import {
  completeSaveRollSubmit,
  openSaveRollModal,
  personalLibraryState,
} from "../../workers/interactions/src/save-roll-handler";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const source = { kind: "discord" as const, id: "1400000000000000000" };
function jsonRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") throw new Error("JSON request body is missing");
  return JSON.parse(init.body) as unknown;
}

function componentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(componentText).join("\n");
  if (typeof value !== "object" || value === null) return "";
  const record = value as Record<string, unknown>;
  return Object.values(record).map(componentText).filter(Boolean).join("\n");
}

const baseInteraction = {
  id: "1400000000000000001",
  application_id: "100000000000000001",
  token: "interaction-token-value",
  channel_id: "1400000000000000002",
  guild_id: "1400000000000000003",
  member: { user: { id: "1400000000000000004", username: "roller" } },
};

function visibleSavedRoll(
  createdAt: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    version: 1 as const,
    id: "123e4567-e89b-42d3-a456-426614174000",
    owner: { type: "user" as const, userId: baseInteraction.member.user.id },
    displayName: "Existing",
    comparisonKey: "existing",
    notation: "1d20",
    title: null,
    repetitions: 1,
    pinned: false,
    manualOrder: 0,
    revision: 1,
    createdByUserId: baseInteraction.member.user.id,
    updatedByUserId: baseInteraction.member.user.id,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("Save roll interaction contract", () => {
  it("parses shared open and retry buttons for Discord and web sources", () => {
    expect(
      parseSaveRollInteraction(
        {
          ...baseInteraction,
          type: 3,
          data: {
            component_type: 2,
            custom_id: buildSaveRollCustomId(source),
          },
        },
        { applicationId: baseInteraction.application_id },
      ),
    ).toMatchObject({ kind: "open", source, retry: false });

    const webSource = {
      kind: "web" as const,
      id: "223e4567-e89b-42d3-a456-426614174000",
      userId: "1400000000000000004",
    };
    expect(
      parseSaveRollInteraction(
        {
          ...baseInteraction,
          type: 3,
          data: {
            component_type: 2,
            custom_id: buildSaveRollCustomId(webSource, "retry"),
          },
        },
        { applicationId: baseInteraction.application_id },
      ),
    ).toMatchObject({ kind: "open", source: webSource, retry: true });
  });

  it("rejects invalid source ids and non-HTTPS Library links", () => {
    expect(() => buildSaveRollCustomId({ kind: "discord", id: "invalid" }))
      .toThrow("Save roll source is invalid");
    expect(() => buildSaveRollSuccessResponse("Attack", "http://example.com/library"))
      .toThrow("Save roll library URL is invalid");
  });

  it("rejects malformed modal submissions", () => {
    expect(parseSaveRollInteraction({
      ...baseInteraction,
      type: 5,
      data: {
        custom_id: buildSaveRollCustomId(source, "submit"),
        components: [],
      },
    }, { applicationId: baseInteraction.application_id })).toBeNull();

    for (const titleMode of ["custom", "keep"]) {
      expect(parseSaveRollInteraction({
        ...baseInteraction,
        type: 5,
        data: {
          custom_id: "save-roll:v2:d:1400000000000000000:submit",
          components: [
            {
              type: 18,
              component: {
                type: 4,
                custom_id: "save-roll-name",
                value: "Attack",
              },
            },
            {
              type: 18,
              component: {
                type: 3,
                custom_id: "save-roll-title-mode",
                values: [titleMode],
              },
            },
          ],
        },
      }, { applicationId: baseInteraction.application_id })).toBeNull();
    }
  });

  it("builds and parses the simplified Discord modal", () => {
    expect(
      buildSaveRollModalResponse(source, {
        defaultName: "Initiative",
        nameConflict: false,
      }),
    ).toEqual({
      type: 9,
      data: {
        custom_id: "save-roll:v2:d:1400000000000000000:submit",
        title: "Save roll",
        components: [
          {
            type: 18,
            label: "Name",
            component: {
              type: 4,
              custom_id: "save-roll-name",
              style: 1,
              min_length: 1,
              max_length: 4_000,
              required: true,
              value: "Initiative",
            },
          },
          {
            type: 18,
            label: "Displayed rolled title",
            component: {
              type: 3,
              custom_id: "save-roll-title-mode",
              required: true,
              min_values: 1,
              max_values: 1,
              options: [
                { label: "Use name above as title", value: "name", default: true },
                { label: "No title", value: "none" },
              ],
            },
          },
        ],
      },
    });

    expect(
      parseSaveRollInteraction(
        {
          ...baseInteraction,
          type: 5,
          data: {
            custom_id: "save-roll:v2:d:1400000000000000000:submit",
            components: [
              {
                type: 18,
                component: {
                  type: 4,
                  custom_id: "save-roll-name",
                  value: "My initiative",
                },
              },
              {
                type: 18,
                component: {
                  type: 3,
                  custom_id: "save-roll-title-mode",
                  values: ["name"],
                },
              },
            ],
          },
        },
        { applicationId: baseInteraction.application_id },
      ),
    ).toMatchObject({
      kind: "submit",
      source,
      name: "My initiative",
      titleMode: "name",
    });
  });

  it("keeps one-field V1 modal submissions readable", () => {
    expect(parseSaveRollInteraction({
      ...baseInteraction,
      type: 5,
      data: {
        custom_id: "save-roll:v1:d:1400000000000000000:submit",
        components: [{
          type: 18,
          component: {
            type: 4,
            custom_id: "save-roll-name",
            value: "Legacy save",
          },
        }],
      },
    }, { applicationId: baseInteraction.application_id })).toMatchObject({
      kind: "submit",
      source,
      name: "Legacy save",
      titleMode: "keep",
    });
  });

  it("opens a blank warned modal when the default name conflicts", () => {
    const response = buildSaveRollModalResponse(source, {
      defaultName: null,
      nameConflict: true,
    });

    expect(response.data.components[0]).toMatchObject({
      type: 18,
      component: {
        type: 4,
        placeholder: "Choose a different name",
      },
    });
    const label = response.data.components[0];
    if (label === undefined) throw new Error("Save roll modal Label is missing");
    expect(label).not.toHaveProperty("description");
    expect(label.component).not.toHaveProperty("value");
    const titleMode = response.data.components[1]?.component;
    if (titleMode?.type !== 3) throw new Error("Expected title mode select");
    expect(titleMode.options[0]).toMatchObject({ value: "name", default: true });
  });

  it("escapes user-controlled names in private errors", () => {
    const response = buildSaveRollErrorResponse(
      "Already saved as **<@1400000000000000004>**.",
    );
    expect(componentText(response)).toContain(
      "Already saved as \\*\\*\\<@1400000000000000004\\>\\*\\*.",
    );
    expect(response.data.allowed_mentions).toEqual({ parse: [] });
  });

  it("builds a copy-specific duplicate response with Open library", () => {
    const response = buildSaveRollDuplicateResponse(
      "Existing attack",
      "https://dicewit.ch/app/library",
    );

    expect(componentText(response)).toContain(
      "A copy of this roll already exists in your personal library as “Existing attack”.",
    );
    expect(response.data.allowed_mentions).toEqual({ parse: [] });
    expect(JSON.stringify(response)).toContain("https://dicewit.ch/app/library");
  });

  it("builds a private V2 success response with Open library", () => {
    expect(
      buildSaveRollSuccessResponse("My initiative", "https://dicewit.ch/library"),
    ).toEqual({
      type: 4,
      data: {
        flags: (1 << 15) | 64,
        allowed_mentions: { parse: [] },
        components: [
          {
            type: 17,
            accent_color: 0x2e_cc_71,
            components: [
              {
                type: 10,
                content: "Saved “My initiative” to your personal library.",
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Open library",
                    url: "https://dicewit.ch/library",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("detects exact composition duplicates and conflicting default names", () => {
    const createdAt = 1_785_637_000_000;
    const intent = parseSaveRollIntentV1({
      version: 1,
      source: "library",
      notation: "2d20+5",
      title: "Attack",
      repetitions: 2,
      defaultName: "Opening attack",
      nameColor: "#A1B2C3",
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    expect(personalLibraryState({
      listRevision: 1,
      savedRolls: [visibleSavedRoll(createdAt, {
        notation: "2d20+5",
        title: "Attack",
        repetitions: 2,
      })],
    }, intent)).toMatchObject({
      duplicate: { displayName: "Existing" },
    });

    expect(personalLibraryState({
      listRevision: 1,
      savedRolls: [visibleSavedRoll(createdAt, {
        displayName: "Opening attack",
        comparisonKey: "opening attack",
        notation: "2d20+5",
        title: "Different title",
        repetitions: 2,
      })],
    }, intent)).toEqual({
      duplicate: null,
      defaultName: null,
      nameConflict: true,
    });

    expect(personalLibraryState({
      listRevision: 1,
      savedRolls: [visibleSavedRoll(createdAt, {
        notation: "2d20+5",
        title: "Selected title",
        repetitions: 2,
      })],
    }, intent, "Selected title")).toMatchObject({
      duplicate: { displayName: "Existing" },
    });
  });

  it("opens a user-specific modal after bounded duplicate checking", async () => {
    const createdAt = Date.now();
    const intent = parseSaveRollIntentV1({
      version: 1,
      source: "fresh",
      notation: "1d20+5",
      title: "Initiative",
      repetitions: 1,
      defaultName: "Initiative",
      nameColor: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    const env = {
      ROLL_WORK: {
        getByName: () => ({
          getSaveRollIntent: () => Promise.resolve({ status: "available", intent }),
        }),
      } as unknown as DurableObjectNamespace,
      WEB_DELIVERY_WORK: {
        getByName: () => ({}),
      } as unknown as DurableObjectNamespace,
      DATA_SERVICE: {
        fetch: () => Promise.resolve(Response.json({
          status: "found",
          listRevision: 4,
          savedRolls: [],
        })),
      } as unknown as Fetcher,
      WEB_APP_URL: "https://dicewit.ch",
    };
    const interaction = parseSaveRollInteraction({
      ...baseInteraction,
      type: 3,
      data: { component_type: 2, custom_id: buildSaveRollCustomId(source) },
    }, { applicationId: baseInteraction.application_id });
    if (interaction === null) throw new Error("Expected Save roll interaction");

    const response = await openSaveRollModal(interaction, env) as ReturnType<
      typeof buildSaveRollModalResponse
    >;
    expect(response).toMatchObject({ type: 9, data: { title: "Save roll" } });
    expect(response.data.components[0]).toMatchObject({
      component: { value: "Initiative" },
    });
    expect(response.data.components[1]).toMatchObject({
      component: { type: 3 },
    });
    const titleMode = response.data.components[1]?.component;
    if (titleMode?.type !== 3) throw new Error("Expected title mode select");
    expect(titleMode.options[0]).toMatchObject({ value: "name", default: true });
  });

  it("returns the existing copy name and Library link before opening a modal", async () => {
    const createdAt = Date.now();
    const intent = parseSaveRollIntentV1({
      version: 1,
      source: "library",
      notation: "2d20+5",
      title: "Attack",
      repetitions: 2,
      defaultName: "Opening attack",
      nameColor: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    const env = {
      ROLL_WORK: {
        getByName: () => ({
          getSaveRollIntent: () => Promise.resolve({ status: "available", intent }),
        }),
      } as unknown as DurableObjectNamespace,
      WEB_DELIVERY_WORK: { getByName: () => ({}) } as unknown as DurableObjectNamespace,
      DATA_SERVICE: {
        fetch: () => Promise.resolve(Response.json({
          status: "found",
          listRevision: 4,
          savedRolls: [visibleSavedRoll(createdAt, {
            displayName: "Existing attack",
            comparisonKey: "existing attack",
            notation: "2d20+5",
            title: "Attack",
            repetitions: 2,
          })],
        })),
      } as unknown as Fetcher,
      WEB_APP_URL: "https://dicewit.ch/app",
    };
    const interaction = parseSaveRollInteraction({
      ...baseInteraction,
      type: 3,
      data: { component_type: 2, custom_id: buildSaveRollCustomId(source) },
    }, { applicationId: baseInteraction.application_id });
    if (interaction === null) throw new Error("Expected Save roll interaction");

    const response = await openSaveRollModal(interaction, env);
    expect(componentText(response)).toContain(
      "A copy of this roll already exists in your personal library as “Existing attack”.",
    );
    expect(JSON.stringify(response)).toContain("https://dicewit.ch/app/library");
  });

  it.each(["missing", "expired"] as const)(
    "returns a private error when the source intent is %s",
    async (status) => {
      const env = {
        ROLL_WORK: {
          getByName: () => ({
            getSaveRollIntent: () => Promise.resolve({ status }),
          }),
        } as unknown as DurableObjectNamespace,
        WEB_DELIVERY_WORK: {
          getByName: () => ({}),
        } as unknown as DurableObjectNamespace,
        DATA_SERVICE: {} as Fetcher,
        WEB_APP_URL: "https://dicewit.ch",
      };
      const interaction = parseSaveRollInteraction({
        ...baseInteraction,
        type: 3,
        data: { component_type: 2, custom_id: buildSaveRollCustomId(source) },
      }, { applicationId: baseInteraction.application_id });
      if (interaction === null) throw new Error("Expected Save roll interaction");

      const response = await openSaveRollModal(interaction, env);
      expect(response).toMatchObject({
        type: 4,
        data: { flags: (1 << 15) | 64 },
      });
      expect(componentText(response)).toContain(
        status === "expired" ? "expired" : "no longer available",
      );
    },
  );

  it("submits an idempotent exact composition save and edits only the private response", async () => {
    const createdAt = Date.now();
    const intent = parseSaveRollIntentV1({
      version: 1,
      source: "library",
      notation: "2d20+5",
      title: "Attack",
      repetitions: 2,
      defaultName: "Opening attack",
      nameColor: "#A1B2C3",
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    const dataRequests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const env = {
      ROLL_WORK: {
        getByName: () => ({
          getSaveRollIntent: () => Promise.resolve({ status: "available", intent }),
        }),
      } as unknown as DurableObjectNamespace,
      WEB_DELIVERY_WORK: {
        getByName: () => ({}),
      } as unknown as DurableObjectNamespace,
      DATA_SERVICE: {
        fetch: async (request: Request) => {
          const path = new URL(request.url).pathname;
          const body = await request.json<Record<string, unknown>>();
          dataRequests.push({ path, body });
          if (path.endsWith("/list")) {
            return Response.json({
              status: "found",
              listRevision: 4,
              savedRolls: [],
            });
          }
          if (path.endsWith("/ensure-user")) {
            return Response.json({ status: "existing" });
          }
          return Response.json({ status: "applied", listRevision: 5 });
        },
      } as unknown as Fetcher,
      WEB_APP_URL: "https://dicewit.ch/app",
    };
    const interaction = parseSaveRollInteraction({
      ...baseInteraction,
      type: 5,
      data: {
        custom_id: "save-roll:v1:d:1400000000000000000:submit",
        components: [
          {
            type: 18,
            component: {
              type: 4,
              custom_id: "save-roll-name",
              value: "My attack",
            },
          },
        ],
      },
    }, { applicationId: baseInteraction.application_id });
    if (interaction === null) throw new Error("Expected Save roll submission");
    const discordFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    await completeSaveRollSubmit(interaction, env);

    const create = dataRequests.find(({ path }) => path.endsWith("/v2/copy"));
    expect(create?.body).toMatchObject({
      owner: { type: "user", userId: baseInteraction.member.user.id },
      actorUserId: baseInteraction.member.user.id,
      expectedListRevision: 4,
      draft: {
        version: 2,
        name: "My attack",
        notation: "2d20+5",
        title: "Attack",
        repetitions: 2,
        nameColor: "#A1B2C3",
      },
      pinned: false,
      mutationId: `discord-save-roll:${baseInteraction.id}`,
    });
    expect(create?.body.id).toMatch(UUID_V4);
    expect(discordFetch).toHaveBeenCalledTimes(1);
    expect(discordFetch.mock.calls[0]?.[0]).toBe(
      `https://discord.com/api/v10/webhooks/${baseInteraction.application_id}/${baseInteraction.token}/messages/@original`,
    );
    const editBody = jsonRequestBody(discordFetch.mock.calls[0]?.[1]);
    expect(editBody).toMatchObject({
      flags: (1 << 15) | 64,
      content: null,
      embeds: [],
      components: [{ accent_color: 0x2e_cc_71 }],
    });
    expect(JSON.stringify(editBody)).toContain("https://dicewit.ch/app/library");
    discordFetch.mockRestore();
  });

  it("uses the saved-roll name as the title for an untitled repeated roll", async () => {
    const createdAt = Date.now();
    const intent = {
      version: 2 as const,
      source: "fresh" as const,
      notation: "4d6kh3",
      title: null,
      repetitions: 3,
      defaultName: null,
      nameColor: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    };
    let createdDraft: unknown;
    const env = {
      ROLL_WORK: {
        getByName: () => ({
          getSaveRollIntent: () => Promise.resolve({ status: "available", intent }),
        }),
      } as unknown as DurableObjectNamespace,
      WEB_DELIVERY_WORK: { getByName: () => ({}) } as unknown as DurableObjectNamespace,
      DATA_SERVICE: {
        fetch: async (request: Request) => {
          const path = new URL(request.url).pathname;
          if (path.endsWith("/list")) {
            return Response.json({ status: "found", listRevision: 1, savedRolls: [] });
          }
          if (path.endsWith("/ensure-user")) {
            return Response.json({ status: "existing" });
          }
          const body = await request.json<{ draft: unknown }>();
          createdDraft = body.draft;
          return Response.json({ status: "applied", listRevision: 2 });
        },
      } as unknown as Fetcher,
      WEB_APP_URL: "https://dicewit.ch/app",
    };
    const interaction = parseSaveRollInteraction({
      ...baseInteraction,
      type: 5,
      data: {
        custom_id: "save-roll:v2:d:1400000000000000000:submit",
        components: [
          {
            type: 18,
            component: {
              type: 4,
              custom_id: "save-roll-name",
              value: "Repeated attack",
            },
          },
          {
            type: 18,
            component: {
              type: 3,
              custom_id: "save-roll-title-mode",
              values: ["name"],
            },
          },
        ],
      },
    }, { applicationId: baseInteraction.application_id });
    if (interaction === null) throw new Error("Expected Save roll submission");
    const discordFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    try {
      await completeSaveRollSubmit(interaction, env);
      expect(createdDraft).toMatchObject({
        name: "Repeated attack",
        notation: "4d6kh3",
        title: "Repeated attack",
        repetitions: 3,
      });
    } finally {
      discordFetch.mockRestore();
    }
  });

  it("reports authoritative personal library capacity privately", async () => {
    const createdAt = Date.now();
    const intent = parseSaveRollIntentV1({
      version: 1,
      source: "fresh",
      notation: "1d20",
      title: "Initiative",
      repetitions: 1,
      defaultName: "Initiative",
      nameColor: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    const savedRoll = {
      version: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      owner: { type: "user", userId: baseInteraction.member.user.id },
      displayName: "Existing",
      comparisonKey: "existing",
      notation: "2d20",
      title: null,
      repetitions: 1,
      pinned: false,
      manualOrder: 0,
      revision: 1,
      createdByUserId: baseInteraction.member.user.id,
      updatedByUserId: baseInteraction.member.user.id,
      createdAt,
      updatedAt: createdAt,
    };
    const dataFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/list")) {
        return Promise.resolve(Response.json({
          status: "found",
          listRevision: 50,
          savedRolls: Array.from({ length: 50 }, () => savedRoll),
        }));
      }
      if (path.endsWith("/ensure-user")) {
        return Promise.resolve(Response.json({ status: "existing" }));
      }
      return Promise.resolve(Response.json({
        status: "cap_reached",
        listRevision: 50,
        limit: 50,
      }, { status: 409 }));
    });
    const env = {
      ROLL_WORK: {
        getByName: () => ({
          getSaveRollIntent: () => Promise.resolve({ status: "available", intent }),
        }),
      } as unknown as DurableObjectNamespace,
      WEB_DELIVERY_WORK: { getByName: () => ({}) } as unknown as DurableObjectNamespace,
      DATA_SERVICE: { fetch: dataFetch } as unknown as Fetcher,
      WEB_APP_URL: "https://dicewit.ch",
    };
    const interaction = parseSaveRollInteraction({
      ...baseInteraction,
      type: 5,
      data: {
        custom_id: buildSaveRollCustomId(source, "submit"),
        components: [{
          type: 18,
          component: {
            type: 4,
            custom_id: "save-roll-name",
            value: "My initiative",
          },
        }],
      },
    }, { applicationId: baseInteraction.application_id });
    if (interaction === null) throw new Error("Expected Save roll submission");
    const discordFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    try {
      await completeSaveRollSubmit(interaction, env);
      expect(dataFetch).toHaveBeenCalledTimes(3);
      const editBody = jsonRequestBody(discordFetch.mock.calls[0]?.[1]);
      expect(componentText(editBody)).toContain("personal library is full");
    } finally {
      discordFetch.mockRestore();
    }
  });

  it.each([
    { duplicateAfterRace: false, expectedText: "Try again" },
    {
      duplicateAfterRace: true,
      expectedText: "A copy of this roll already exists in your personal library as “Concurrent copy”.",
    },
  ])("handles a submit-time list revision race ($duplicateAfterRace)", async ({
    duplicateAfterRace,
    expectedText,
  }) => {
    const createdAt = Date.now();
    const intent = parseSaveRollIntentV1({
      version: 1,
      source: "fresh",
      notation: "1d20",
      title: "Initiative",
      repetitions: 1,
      defaultName: "Initiative",
      nameColor: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    let listCalls = 0;
    const env = {
      ROLL_WORK: {
        getByName: () => ({
          getSaveRollIntent: () => Promise.resolve({ status: "available", intent }),
        }),
      } as unknown as DurableObjectNamespace,
      WEB_DELIVERY_WORK: { getByName: () => ({}) } as unknown as DurableObjectNamespace,
      DATA_SERVICE: {
        fetch: (request: Request) => {
          const path = new URL(request.url).pathname;
          if (path.endsWith("/list")) {
            listCalls += 1;
            const duplicate = duplicateAfterRace && listCalls === 2
              ? [visibleSavedRoll(createdAt, {
                  displayName: "Concurrent copy",
                  notation: "1d20",
                  title: "Initiative",
                })]
              : [];
            return Promise.resolve(Response.json({
              status: "found",
              listRevision: listCalls === 1 ? 4 : 5,
              savedRolls: duplicate,
            }));
          }
          if (path.endsWith("/ensure-user")) {
            return Promise.resolve(Response.json({ status: "existing" }));
          }
          return Promise.resolve(Response.json({
            status: "list_revision_conflict",
            listRevision: 5,
          }, { status: 409 }));
        },
      } as unknown as Fetcher,
      WEB_APP_URL: "https://dicewit.ch",
    };
    const interaction = parseSaveRollInteraction({
      ...baseInteraction,
      type: 5,
      data: {
        custom_id: buildSaveRollCustomId(source, "submit"),
        components: [{
          type: 18,
          component: {
            type: 4,
            custom_id: "save-roll-name",
            value: "My initiative",
          },
        }],
      },
    }, { applicationId: baseInteraction.application_id });
    if (interaction === null) throw new Error("Expected Save roll submission");
    const discordFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    try {
      await completeSaveRollSubmit(interaction, env);
      const editBody = jsonRequestBody(discordFetch.mock.calls[0]?.[1]);
      expect(editBody).toMatchObject({ flags: (1 << 15) | 64 });
      expect(componentText(editBody)).toContain(expectedText);
      if (duplicateAfterRace) {
        expect(JSON.stringify(editBody)).toContain("https://dicewit.ch/library");
      } else {
        expect(JSON.stringify(editBody)).toContain(
          buildSaveRollCustomId(source, "retry"),
        );
      }
    } finally {
      discordFetch.mockRestore();
    }
  });

  it("validates the minimal authoritative 90-day intent", () => {
    const createdAt = 1_785_637_000_000;
    const intent = {
      version: 1,
      source: "library",
      notation: "2d20+5",
      title: "Attack",
      repetitions: 2,
      defaultName: "Opening attack",
      nameColor: "#A1B2C3",
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    };

    expect(parseSaveRollIntentV1(intent)).toEqual(intent);
    expect(parseSaveRollIntent({
      ...intent,
      version: 2,
      source: "fresh",
      title: null,
      defaultName: null,
    })).toEqual({
      ...intent,
      version: 2,
      source: "fresh",
      title: null,
      defaultName: null,
    });
    expect(() =>
      parseSaveRollIntentV1({ ...intent, expiresAt: intent.expiresAt + 1 }),
    ).toThrow("Save roll intent is invalid");
    expect(() => parseSaveRollIntent({
      ...intent,
      version: 2,
      source: "fresh",
      title: null,
      repetitions: 1,
      defaultName: null,
    })).toThrow("Save roll intent is invalid");
  });
});
