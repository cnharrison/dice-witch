import type {
  RollDeliveryPayload,
  RollLoggingContext,
} from "../../../packages/discord-contracts/src";
import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";
import type { SavedRollScope } from "./saved-roll-picker";

export type FetchPort = {
  fetch(request: Request): Promise<Response>;
};

export type DurableObjectNamespacePort<T> = {
  getByName(name: string): T;
};

export type GuildDeliverySettings = {
  skipDiceDelay: boolean;
  hideRollResultText: boolean;
};

export type RollAcceptanceInput = RollDeliveryPayload;

export type TextResultRequest = {
  applicationId: string;
  guildId: string;
  channelId: string;
  messageId: string;
};

export type PickerContext = {
  version: 1;
  interactionId: string;
  userId: string;
  guildId: string | null;
  channelId: string;
};

export type SavedRollSelection = {
  scope: SavedRollScope;
  id: string;
  revision: number;
};

export type PickerUpdate = PickerContext & {
  action: "mine" | "server" | "previous" | "next" | "select";
  selection: SavedRollSelection | null;
};

export type DirectSavedRollReservation = PickerContext & {
  selection: SavedRollSelection;
};

export type SavedRollCopyRequest = PickerContext & {
  username: string;
  name: string | null;
};

export type SavedRollDeliveryRequest = {
  version: 1;
  sessionId: string;
  selection: SavedRollSelection;
  deferredAt: number;
  interaction: {
    id: string;
    applicationId: string;
    token: string;
  };
  actor: {
    version: 1;
    userId: string;
    guildId: string | null;
    channelId: string;
    username: string;
    loggingContext: RollLoggingContext | null;
  };
  sourceInteraction: "command" | "component";
  responseMode: "channel-message" | "edit-original";
};

export type RollWorkPort = {
  acceptDelivery(value: RollAcceptanceInput): Promise<SchemaInput>;
  getSaveRollIntent(): Promise<SchemaInput>;
  getTextResult(value: TextResultRequest): Promise<SchemaInput>;
  openSavedRollPicker(value: PickerContext): Promise<SchemaInput>;
  updateSavedRollPicker(value: PickerUpdate): Promise<SchemaInput>;
  reserveSavedRollRun(value: PickerContext): Promise<SchemaInput>;
  reserveDirectSavedRoll(
    value: DirectSavedRollReservation,
  ): Promise<SchemaInput>;
  acceptSavedRollDelivery(
    value: SavedRollDeliveryRequest,
  ): Promise<SchemaInput>;
  copySavedRollToMine(value: SavedRollCopyRequest): Promise<SchemaInput>;
};

export type WebDeliveryWorkPort = Pick<
  RollWorkPort,
  "getSaveRollIntent" | "getTextResult"
>;

export type GatewayStatusPort = {
  getStatusSnapshot(): Promise<SchemaInput>;
};

export type DiscordRestPort = {
  sendRollHelper(value: { rollId: string; userId: string }): Promise<SchemaInput>;
};

export type SaveRollIntentPort = {
  getSaveRollIntent(): Promise<SchemaInput>;
};

export type SaveRollIntentNamespace = DurableObjectNamespacePort<
  SaveRollIntentPort
>;
