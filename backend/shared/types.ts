import { Canvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import chroma from "chroma-js";
import {
  AttachmentBuilder,
  ButtonInteraction,
  Client,
  Collection,
  CommandInteraction,
  EmbedBuilder,
  EmbedField,
  Guild,
  Interaction,
  Message,
  TextChannel,
} from "discord.js";

export type Icon =
  | "trashcan"
  | "explosion"
  | "recycle"
  | "chevronUp"
  | "chevronDown"
  | "target-success"
  | "critical-success"
  | "critical-failure"
  | "penetrate"
  | "blank"
  | null;

export enum EventType {
  RECEIVED_COMMAND = "receivedCommand",
  CRITICAL_ERROR = "criticalError",
  ROLL_TITLE_REJECTED = "rollTitleRejected",
  ROLL_TITLE_ACCEPTED = "rollTitleAccepted",
  ROLL_TITLE_TIMEOUT = "rollTitleTimeout",
  GUILD_ADD = "guildAdd",
  GUILD_REMOVE = "guildRemove",
  SENT_ROLL_RESULT_MESSAGE = "sentRollResultMessage",
  SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE = "sentRollResultMessageWithImage",
  SENT_HELPER_MESSAGE = "sentHelperMessage",
  SENT_NEED_PERMISSION_MESSAGE = "sentNeedPermissionsMessage",
  SENT_DICE_OVER_MAX_MESSAGE = "sentDiceOverMaxMessage",
}

export type DiceArray = Die[][];
export type DiceTypes = 20 | 12 | 10 | 8 | 6 | 4 | "%";
export type DiceTypesToDisplay = DiceTypes | 100;
export type DiceFaces =
  | 90
  | 80
  | 70
  | 60
  | 50
  | 40
  | 30
  | 20
  | 19
  | 18
  | 17
  | 16
  | 15
  | 14
  | 13
  | 12
  | 11
  | 10
  | 9
  | 8
  | 7
  | 6
  | 5
  | 4
  | 3
  | 2
  | 1
  | 0;

export type DieGenerator = (
  fill: string,
  outline: string,
  width: number,
  height: number
) => void;

export type DiceFaceData = {
  [K in DiceTypes]: string;
};
export interface Result {
  output: string;
  results: number;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  execute: (props: Partial<CommandProps>) => void;
}

export interface CommandProps {
  args: string[];
  discord: Client;
  commands: Collection<string, Command>;
  interaction?: CommandInteraction | ButtonInteraction;
  title?: string;
  timesToRepeat?: number;
}

export type CommandContext = {
  args: string[];
  discord: Client;
  logOutputChannel: TextChannel;
  commands: Collection<string, Command>;
  interaction?: Interaction;
  title?: string;
  timesToRepeat?: number;
};

export type KnowledgeBaseProps = Pick<
  CommandProps,
  "args" | "interaction"

>;

export type RollProps = Pick<
  CommandProps,
  | "args"
  | "interaction"
  | "title"
  | "timesToRepeat"
  | "discord"
>;

export type HelpProps = Pick<CommandProps, "args"> & {
  commands?: Collection<string, Command>;
  interaction?: CommandInteraction | ButtonInteraction;
};
export type StatusProps = Pick<
  CommandProps,
  "discord" | "interaction"
>;
export type TitledRollProps = Pick<
  CommandProps,
  "args" | "interaction"
>;

export type EmbedObject = {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
};

export interface LogEventProps {
  eventType: EventType;
  command?: Command;
  args?: string[];
  title?: string;
  guild?: Guild;
  resultMessage?: string;
  embedParam?: EmbedObject;
  interaction?: CommandInteraction | ButtonInteraction;
  error?: Error;
  canvasString?: string;
  files?: AttachmentBuilder[];
  sourceName?: string;
  username?: string;
  channelName?: string;
  guildName?: string;
}

export interface Die {
  sides: DiceTypes;
  rolled: DiceFaces;
  value: number;
  notation?: string;
  modifiers?: string[];
  icon?: Icon[] | null;
  iconSpacing?: number | null;
  color: chroma.Color;
  secondaryColor: chroma.Color;
  textColor: chroma.Color;
}

export type ArticleTypes =
  | "minmax"
  | "exploding"
  | "reroll"
  | "keepdrop"
  | "target"
  | "crit"
  | "sort"
  | "math"
  | "repeating";

export type KnowledgeBase = {
  [key: string]: EmbedField[];
};

export interface PatternFillObject {
  string: string;
  name: string;
}

export interface GenerateDieProps {
  result: number;
  textColor?: string;
  outlineColor?: string;
  solidFill?: string;
  patternFill?: PatternFillObject;
  gradientFill?: string;
  borderWidth?: string;
  width?: string;
  height?: string;
}

export interface UpdateOnCommandProps {
  prisma: PrismaClient;
  commandName: string;
  message?: Message;
  interaction?: Interaction;
}

export interface GuildType {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  memberCount: number;
  approximateMemberCount?: number;
  preferredLocale: string;
  publicUpdatesChannelId?: string;
  joinedTimestamp: number;
}

export interface UserType {
  id: string;
  username: string;
  flags?: { bitfield: number };
  discriminator: string;
  avatar?: string;
}

export interface SendDiceOverMaxMessageParams {
  args?: string[];
  interaction?: CommandInteraction | ButtonInteraction;
  shouldHaveImage?: boolean;
}

export interface SendDiceResultMessageParams {
  resultArray: Result[];
  interaction?: CommandInteraction | ButtonInteraction;
  title?: string;
}

export interface SendDiceResultMessageWithImageParams {
  resultArray: Result[];
  attachment: AttachmentBuilder;
  canvas: Canvas;
  interaction?: CommandInteraction | ButtonInteraction;
  title?: string;
}

export interface SendDiceRolledMessageParams {
  diceArray: (Die | Die[])[];
  interaction?: CommandInteraction | ButtonInteraction;
}

export interface SendHelperMessageParams {
  interaction: CommandInteraction | ButtonInteraction;
  discord: Client;
}

export interface SendNeedPermissionMessageParams {
  interaction?: CommandInteraction | ButtonInteraction;
}

export interface GenerateEmbedMessageParams {
  resultArray: Result[];
  attachment: AttachmentBuilder;
  title?: string;
  interaction?: CommandInteraction | ButtonInteraction;
  source?: string;
  username?: string;
}

export interface UserCount {
  totalGuilds?: number;
  totalMembers?: number;
}