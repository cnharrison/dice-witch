import { z } from "zod";
import {
  extractRollLoggingContext,
  type RollLoggingContext,
} from "./roll-interaction";
import {
  boundaryObjectSchema,
  boundedNameSchema,
  interactionTokenSchema,
  type BoundaryObject,
  type SchemaInput,
  snowflakeSchema,
} from "./schema-primitives";

const SAVED_ROLL_SELECTION = /^(mine|server):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAVED_ROLL_COMPONENT = /^saved-roll:v1:([1-9][0-9]{16,19}):(mine|server|previous|next|run|copy|select|rename|run:(?:mine|server):.+)$/;
const MAX_TYPED_SELECTION_LENGTH = 256;

const SavedRollInteractionTypeSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
const SavedRollSelectionSchema = z.string().regex(SAVED_ROLL_SELECTION);
const SavedRollComponentActionSchema = z.enum([
  "mine",
  "server",
  "previous",
  "next",
  "run",
  "copy",
  "select",
]);
const SavedRollUserSchema = z.looseObject({
  username: boundedNameSchema(1, 32),
});
const SavedRollCommandOptionsSchema = z.array(boundaryObjectSchema).length(1);
const SavedRollCommandOptionSchema = z.looseObject({
  name: z.literal("name"),
  type: z.literal(3),
  value: z.string().max(MAX_TYPED_SELECTION_LENGTH),
  focused: z.undefined().optional(),
});
const SavedRollAutocompleteOptionSchema = z.looseObject({
  name: z.literal("name"),
  type: z.literal(3),
  value: z.string().max(MAX_TYPED_SELECTION_LENGTH),
  focused: z.literal(true),
});
const RenameModalComponentsSchema = z.array(boundaryObjectSchema).length(1);
const RenameLabelSchema = z.looseObject({
  type: z.literal(18),
  component: boundaryObjectSchema,
});
const RenameLegacyRowSchema = z.looseObject({
  components: z.tuple([boundaryObjectSchema]),
});
const RenameInputSchema = z.looseObject({
  type: z.literal(4),
  custom_id: z.literal("saved-roll-name"),
  value: z.string(),
});
const SelectedComponentValueSchema = z.tuple([SavedRollSelectionSchema]);

export type SavedRollInteractionScope = {
  applicationId: string;
  guildId?: string;
};

type SavedRollInteractionContext = {
  id: string;
  applicationId: string;
  token: string;
  guildId: string | null;
  channelId: string;
  loggingContext: RollLoggingContext | null;
  userId: string;
  username: string;
};

export type SavedRollInteraction =
  | (SavedRollInteractionContext & {
      kind: "command";
      selection: string | null;
    })
  | (SavedRollInteractionContext & {
      kind: "autocomplete";
      query: string;
    })
  | (SavedRollInteractionContext & {
      kind: "component";
      sessionId: string;
      action: z.infer<typeof SavedRollComponentActionSchema>;
      selection: string | null;
    })
  | (SavedRollInteractionContext & {
      kind: "modal";
      sessionId: string;
      name: string;
    });

function requireSnowflake(value: SchemaInput, name: string): string {
  const result = snowflakeSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${name} must be a Discord Snowflake`);
  }
  return result.data;
}

function parseContext(
  value: BoundaryObject,
  scope: SavedRollInteractionScope,
): SavedRollInteractionContext {
  const applicationId = requireSnowflake(
    value.application_id,
    "Saved roll application id",
  );
  if (applicationId !== scope.applicationId) {
    throw new Error("Saved roll application does not match");
  }
  const guildId =
    value.guild_id === undefined
      ? null
      : requireSnowflake(value.guild_id, "Saved roll guild id");
  if (
    scope.guildId !== undefined &&
    guildId !== null &&
    guildId !== scope.guildId
  ) {
    throw new Error("Saved roll guild does not match");
  }
  const token = interactionTokenSchema.safeParse(value.token);
  if (!token.success) {
    throw new Error("Saved roll interaction token is invalid");
  }
  const member = boundaryObjectSchema.safeParse(value.member);
  const memberUser = member.success
    ? boundaryObjectSchema.safeParse(member.data.user)
    : null;
  const user = SavedRollUserSchema.safeParse(
    memberUser?.success ? memberUser.data : value.user,
  );
  if (!user.success) {
    throw new Error("Saved roll user is invalid");
  }
  const userId = requireSnowflake(user.data.id, "Saved roll user id");
  const channelId = requireSnowflake(value.channel_id, "Saved roll channel id");
  let loggingContext: RollLoggingContext;
  try {
    loggingContext = extractRollLoggingContext(value, guildId, channelId);
  } catch {
    throw new Error("Saved roll channel is invalid");
  }
  return {
    id: requireSnowflake(value.id, "Saved roll interaction id"),
    applicationId,
    token: token.data,
    guildId,
    channelId,
    loggingContext,
    userId,
    username: user.data.username,
  };
}

function parseCommandOption(
  value: SchemaInput,
  autocomplete: boolean,
): string | null {
  if (value === undefined) return null;
  const options = SavedRollCommandOptionsSchema.safeParse(value);
  if (!options.success) {
    throw new Error("Saved roll command options are invalid");
  }
  const optionSchema = autocomplete
    ? SavedRollAutocompleteOptionSchema
    : SavedRollCommandOptionSchema;
  const option = optionSchema.safeParse(options.data[0]);
  if (!option.success) {
    throw new Error("Saved roll command option is invalid");
  }
  return option.data.value;
}

export function parseSavedRollInteraction(
  value: SchemaInput,
  scope: SavedRollInteractionScope,
): SavedRollInteraction | null {
  const interaction = boundaryObjectSchema.safeParse(value);
  if (!interaction.success) throw new Error("Interaction must be an object");
  const interactionType = SavedRollInteractionTypeSchema.safeParse(
    interaction.data.type,
  );
  if (!interactionType.success) return null;
  const parsedData = boundaryObjectSchema.safeParse(interaction.data.data);
  if (!parsedData.success) throw new Error("Saved roll data is invalid");
  const data = parsedData.data;
  if (interactionType.data === 2 || interactionType.data === 4) {
    if (data.name !== "library" || data.type !== 1) return null;
    const context = parseContext(interaction.data, scope);
    const selection = parseCommandOption(
      data.options,
      interactionType.data === 4,
    );
    if (interactionType.data === 4) {
      return { ...context, kind: "autocomplete", query: selection ?? "" };
    }
    return { ...context, kind: "command", selection };
  }
  const customId = z.string().safeParse(data.custom_id);
  if (!customId.success) return null;
  const match = SAVED_ROLL_COMPONENT.exec(customId.data);
  if (match === null) return null;
  const sessionId = match[1];
  const componentValue = match[2];
  if (componentValue === undefined) {
    throw new Error("Saved roll component is invalid");
  }
  const encodedRunSelection = componentValue.startsWith("run:")
    ? componentValue.slice(4)
    : null;
  const matchedAction = encodedRunSelection === null ? componentValue : "run";
  if (interactionType.data === 5) {
    const modal = RenameModalComponentsSchema.safeParse(data.components);
    if (matchedAction !== "rename" || !modal.success) {
      throw new Error("Saved roll rename modal is invalid");
    }
    const wrapper = modal.data[0];
    const label = RenameLabelSchema.safeParse(wrapper);
    const legacyRow = RenameLegacyRowSchema.safeParse(wrapper);
    let input: BoundaryObject | null = null;
    if (label.success) input = label.data.component;
    else if (legacyRow.success) input = legacyRow.data.components[0];
    const renamed = RenameInputSchema.safeParse(input);
    if (!renamed.success) {
      throw new Error("Saved roll rename modal is invalid");
    }
    if (sessionId === undefined) {
      throw new Error("Saved roll component session is invalid");
    }
    return {
      ...parseContext(interaction.data, scope),
      kind: "modal",
      sessionId,
      name: renamed.data.value,
    };
  }
  if (matchedAction === "rename") {
    throw new Error("Saved roll component is invalid");
  }
  const action = SavedRollComponentActionSchema.safeParse(matchedAction);
  if (!action.success) {
    throw new Error("Saved roll component is invalid");
  }
  let selection: string | null = encodedRunSelection;
  if (action.data === "select") {
    const selected = SelectedComponentValueSchema.safeParse(data.values);
    if (data.component_type !== 3 || !selected.success) {
      throw new Error("Saved roll component selection is invalid");
    }
    selection = selected.data[0];
  } else {
    const parsedSelection = selection === null
      ? null
      : SavedRollSelectionSchema.safeParse(selection);
    if (
      (parsedSelection !== null && !parsedSelection.success) ||
      data.component_type !== 2 ||
      data.values !== undefined
    ) {
      throw new Error(
        selection === null
          ? "Saved roll component is invalid"
          : "Saved roll component selection is invalid",
      );
    }
  }
  if (sessionId === undefined) {
    throw new Error("Saved roll component session is invalid");
  }
  return {
    ...parseContext(interaction.data, scope),
    kind: "component",
    sessionId,
    action: action.data,
    selection,
  };
}

export function isSavedRollSelection(value: string): boolean {
  return SAVED_ROLL_SELECTION.test(value);
}
