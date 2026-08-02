import {
  buildEditOriginalResponse,
  buildWebAppRouteUrl,
  DISCORD_COMPONENTS_V2_FLAG,
  type DiscordComponentsV2Message,
  type SavedRollInteraction,
} from "../../../packages/discord-contracts/src";
import {
  buildSavedRollAutocompleteResponse,
  buildSavedRollPickerResponse,
  fetchVisibleSavedRolls,
  resolveSavedRollSelection,
  type SavedRollScope,
  type VisibleSavedRollV1,
} from "./saved-roll-picker";

export type SavedRollHandlerEnv = {
  DATA_SERVICE: Fetcher;
  ROLL_WORK: DurableObjectNamespace;
  WEB_APP_URL: string;
};

type PickerState = {
  status: string;
  scope?: SavedRollScope;
  page?: number;
  selectedId?: string | null;
  selectedRevision?: number | null;
  selection?: {
    scope: SavedRollScope;
    id: string;
    revision: number;
  };
};

type SavedRollWorkStub = {
  openSavedRollPicker(value: unknown): Promise<PickerState>;
  updateSavedRollPicker(value: unknown): Promise<PickerState>;
  reserveSavedRollRun(value: unknown): Promise<PickerState>;
  reserveDirectSavedRoll(value: unknown): Promise<PickerState>;
  acceptSavedRollDelivery(value: unknown): Promise<unknown>;
  copySavedRollToMine(value: unknown): Promise<unknown>;
};

function escapeDiscordMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replace(/([*_~|])/g, "\\$1")
    .replaceAll("<", "\\<")
    .replaceAll(">", "\\>");
}

function messageResponse(content: string, color = 0xe7_4c_3c): {
  type: 4;
  data: DiscordComponentsV2Message & { allowed_mentions: { parse: string[] } };
} {
  return {
    type: 4,
    data: {
      flags: DISCORD_COMPONENTS_V2_FLAG | 64,
      components: [
        {
          type: 17,
          accent_color: color,
          components: [{ type: 10, content: escapeDiscordMarkdown(content) }],
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}

function errorResponse(content: string) {
  return messageResponse(content);
}

function pickerContext(interaction: SavedRollInteraction) {
  return {
    version: 1 as const,
    interactionId: interaction.id,
    userId: interaction.userId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  };
}

function savedRollRunDefer(interaction: SavedRollInteraction) {
  if (interaction.kind === "component") return { type: 6 };
  return interaction.guildId === null
    ? { type: 5, data: { flags: 64 } }
    : { type: 5 };
}

function savedRollResponseMode(
  interaction: SavedRollInteraction,
): "channel-message" | "edit-original" {
  return interaction.kind === "component"
    ? "channel-message"
    : "edit-original";
}

function selectedRecord(
  selection: string,
  mine: readonly VisibleSavedRollV1[],
  server: readonly VisibleSavedRollV1[],
) {
  const resolved = resolveSavedRollSelection(selection, mine, server);
  return resolved.status === "found"
    ? {
        scope: resolved.scope,
        id: resolved.savedRoll.id,
        revision: resolved.savedRoll.revision,
      }
    : resolved;
}

function copyResponse(result: unknown, sessionId: string) {
  if (
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    result.status === "name_conflict" &&
    "name" in result &&
    typeof result.name === "string"
  ) {
    return {
      type: 9,
      data: {
        custom_id: `saved-roll:v1:${sessionId}:rename`,
        title: "Rename library roll",
        components: [
          {
            type: 18,
            label: "Personal library roll name",
            description: "That name is already used. Choose a different name.",
            component: {
              type: 4,
              custom_id: "saved-roll-name",
              style: 1,
              min_length: 1,
              max_length: 4_000,
              required: true,
              value: result.name,
            },
          },
        ],
      },
    };
  }
  const status =
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    typeof result.status === "string"
      ? result.status
      : "unavailable";
  if (status === "copied") {
    const name =
      typeof result === "object" &&
      result !== null &&
      "name" in result &&
      typeof result.name === "string"
        ? result.name
        : "Library roll";
    return messageResponse(
      `Copied “${name}” to your personal library.`,
      0x2e_cc_71,
    );
  }
  const messages: Record<string, string> = {
    cap_reached: "Your personal library already has the maximum of 50 rolls.",
    conflict: "Your personal library changed. Try Copy to Personal again.",
    expired: "This library picker expired. Run /library again.",
    invalid_name: "Choose a valid library roll name.",
    invalid_selection: "Choose a server library roll before copying.",
    missing: "That server library roll no longer exists.",
    stale: "That server library roll changed. Reopen the picker.",
    unauthorized: "This library action belongs to another user.",
    unavailable: "This library roll could not be copied. Please try again.",
  };
  return errorResponse(messages[status] ?? messages.unavailable ?? "Copy failed.");
}

function runError(status: string): string {
  switch (status) {
    case "missing":
      return "That library roll no longer exists.";
    case "stale":
      return "That library roll changed. Reopen the picker and choose it again.";
    case "unauthorized":
      return "This library picker belongs to another user.";
    case "expired":
      return "This library picker expired. Run /library again.";
    case "consumed":
      return "This library picker has already been used.";
    default:
      return "This library roll could not be run. Please try again.";
  }
}

async function acceptDeferredSavedRoll(
  stub: SavedRollWorkStub,
  interaction: SavedRollInteraction,
  sessionId: string,
  selection: { scope: SavedRollScope; id: string; revision: number },
  deferredAt: number,
): Promise<void> {
  let status = "unavailable";
  try {
    const result: unknown = await stub.acceptSavedRollDelivery({
      version: 1,
      sessionId,
      selection,
      deferredAt,
      interaction: {
        id: interaction.id,
        applicationId: interaction.applicationId,
        token: interaction.token,
      },
      actor: {
        version: 1,
        userId: interaction.userId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        username: interaction.username,
        loggingContext: interaction.loggingContext,
      },
      sourceInteraction: interaction.kind,
      responseMode: savedRollResponseMode(interaction),
    });
    if (
      typeof result === "object" &&
      result !== null &&
      "status" in result &&
      typeof result.status === "string"
    ) {
      status = result.status;
      if (status === "created" || status === "existing") {
        console.info(
          JSON.stringify({
            telemetryVersion: 1,
            level: "info",
            message: "Discord roll lifecycle advanced",
            interactionId: interaction.id,
            stage: "accepted",
            status,
            commandName: "library",
          }),
        );
        return;
      }
    }
  } catch {
    status = "unavailable";
  }
  try {
    await fetch(
      buildEditOriginalResponse(
        interaction,
        messageResponse(runError(status)).data,
      ),
    );
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Saved roll error response failed",
      }),
    );
  }
}

async function prepareDeferredSavedRoll(
  interaction: SavedRollInteraction,
  env: SavedRollHandlerEnv,
  deferredAt: number,
): Promise<void> {
  let content = "This library roll could not be run. Please try again.";
  try {
    const result = await handleSavedRollInteraction(
      interaction,
      env,
      undefined,
      deferredAt,
    );
    if (
      typeof result === "object" &&
      result !== null &&
      "type" in result &&
      (result.type === 5 || result.type === 6)
    ) {
      return;
    }
    if (
      typeof result === "object" &&
      result !== null &&
      "data" in result &&
      typeof result.data === "object" &&
      result.data !== null &&
      "content" in result.data &&
      typeof result.data.content === "string"
    ) {
      content = result.data.content;
    }
  } catch {
    // The private original response below is the terminal user-facing failure.
  }
  try {
    await fetch(
      buildEditOriginalResponse(interaction, messageResponse(content).data),
    );
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Deferred saved roll error delivery failed",
      }),
    );
  }
}

export async function handleSavedRollInteraction(
  interaction: SavedRollInteraction,
  env: SavedRollHandlerEnv,
  ctx?: ExecutionContext,
  deferredAt?: number,
): Promise<unknown> {
  let lists;
  if (interaction.kind === "autocomplete") {
    try {
      lists = await fetchVisibleSavedRolls(
        env.DATA_SERVICE,
        interaction.userId,
        interaction.guildId,
      );
      return buildSavedRollAutocompleteResponse(
        interaction.query,
        lists.mine.savedRolls,
        lists.server.savedRolls,
      );
    } catch {
      return { type: 8, data: { choices: [] } };
    }
  }

  const shouldDeferPreparation =
    (interaction.kind === "command" && interaction.selection !== null) ||
    (interaction.kind === "component" &&
      (interaction.action === "run" || interaction.action === "select"));
  if (ctx !== undefined && shouldDeferPreparation) {
    const capturedDeferredAt = Date.now();
    console.info(
      JSON.stringify({
        telemetryVersion: 1,
        level: "info",
        message: "Discord roll lifecycle advanced",
        interactionId: interaction.id,
        stage: "deferred",
        deferredAt: capturedDeferredAt,
        commandName: "library",
      }),
    );
    ctx.waitUntil(
      prepareDeferredSavedRoll(interaction, env, capturedDeferredAt),
    );
    return savedRollRunDefer(interaction);
  }

  const sessionId =
    interaction.kind === "component" || interaction.kind === "modal"
      ? interaction.sessionId
      : interaction.id;
  const stub = env.ROLL_WORK.getByName(
    sessionId,
  ) as unknown as SavedRollWorkStub;

  if (interaction.kind === "modal") {
    const result = await stub.copySavedRollToMine({
      ...pickerContext(interaction),
      username: interaction.username,
      name: interaction.name,
    });
    return copyResponse(result, sessionId);
  }

  if (interaction.kind === "command") {
    try {
      lists = await fetchVisibleSavedRolls(
        env.DATA_SERVICE,
        interaction.userId,
        interaction.guildId,
      );
    } catch {
      return errorResponse("The library is unavailable. Please try again.");
    }
    if (interaction.selection === null) {
      let state = await stub.openSavedRollPicker(pickerContext(interaction));
      if (
        lists.mine.savedRolls.length === 0 &&
        lists.server.savedRolls.length > 0 &&
        state.status !== "conflict" &&
        state.status !== "expired"
      ) {
        state = await stub.updateSavedRollPicker({
          ...pickerContext(interaction),
          action: "server",
          selection: null,
        });
      }
      if (
        (state.status !== "created" &&
          state.status !== "existing" &&
          state.status !== "updated") ||
        state.scope === undefined ||
        state.page === undefined
      ) {
        return errorResponse(runError(state.status));
      }
      return buildSavedRollPickerResponse({
        sessionId,
        scope: state.scope,
        page: state.page,
        mine: lists.mine.savedRolls,
        server: lists.server.savedRolls,
        libraryUrl: buildWebAppRouteUrl(env.WEB_APP_URL, "library"),
      });
    }
    const selection = selectedRecord(
      interaction.selection,
      lists.mine.savedRolls,
      lists.server.savedRolls,
    );
    if ("status" in selection) {
      return errorResponse(
        selection.status === "ambiguous"
          ? "That name exists in both personal and server libraries. Choose an autocomplete result."
          : "No visible library roll has that name.",
      );
    }
    const reserved = await stub.reserveDirectSavedRoll({
      ...pickerContext(interaction),
      selection,
    });
    if (reserved.status !== "reserved" && reserved.status !== "existing") {
      return errorResponse(runError(reserved.status));
    }
    await acceptDeferredSavedRoll(
      stub,
      interaction,
      sessionId,
      selection,
      deferredAt ?? Date.now(),
    );
    return savedRollRunDefer(interaction);
  }

  if (interaction.action === "run" || interaction.action === "select") {
    if (interaction.selection !== null) {
      try {
        lists = await fetchVisibleSavedRolls(
          env.DATA_SERVICE,
          interaction.userId,
          interaction.guildId,
        );
      } catch {
        return errorResponse("The library is unavailable. Please try again.");
      }
      const selection = selectedRecord(
        interaction.selection,
        lists.mine.savedRolls,
        lists.server.savedRolls,
      );
      if ("status" in selection) {
        return errorResponse("That library roll is no longer available.");
      }
      const selected = await stub.updateSavedRollPicker({
        ...pickerContext(interaction),
        action: "select",
        selection,
      });
      if (selected.status !== "updated") {
        return errorResponse(runError(selected.status));
      }
    }
    const reserved = await stub.reserveSavedRollRun(pickerContext(interaction));
    if (
      (reserved.status !== "reserved" && reserved.status !== "existing") ||
      reserved.selection === undefined
    ) {
      return errorResponse(runError(reserved.status));
    }
    await acceptDeferredSavedRoll(
      stub,
      interaction,
      sessionId,
      reserved.selection,
      deferredAt ?? Date.now(),
    );
    return savedRollRunDefer(interaction);
  }
  if (interaction.action === "copy") {
    const result = await stub.copySavedRollToMine({
      ...pickerContext(interaction),
      username: interaction.username,
      name: null,
    });
    return copyResponse(result, sessionId);
  }

  try {
    lists = await fetchVisibleSavedRolls(
      env.DATA_SERVICE,
      interaction.userId,
      interaction.guildId,
    );
  } catch {
    return errorResponse("The library is unavailable. Please try again.");
  }
  const state = await stub.updateSavedRollPicker({
    ...pickerContext(interaction),
    action: interaction.action,
    selection: null,
  });
  if (
    state.status !== "updated" ||
    state.scope === undefined ||
    state.page === undefined
  ) {
    return errorResponse(runError(state.status));
  }
  return buildSavedRollPickerResponse({
    sessionId,
    scope: state.scope,
    page: state.page,
    mine: lists.mine.savedRolls,
    server: lists.server.savedRolls,
    libraryUrl: buildWebAppRouteUrl(env.WEB_APP_URL, "library"),
    update: true,
  });
}
