import {
  ButtonInteraction,
  Client,
  Collection,
  CommandInteraction,
  Guild,
  Interaction,
  Message,
  AttachmentBuilder,
  EmbedBuilder,
  EmbedField,
  TextChannel,
} from "discord.js";
import chroma from "chroma-js";
import { PrismaClient } from "@prisma/client";

export type Icon =
  | "trashcan"
  | "explosion"
  | "recycle"
  | "re-roll"
  | "chevronDown"
  | "chevronUp"
  | "bullseye"
  | "crit"
  | "dizzyFace"
  | "arrowThrough"
  | "blank";

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
  SENT_HELER_MESSAGE = "sentHelperMessage",
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
  message: Message;
  args: string[];
  discord: Client;
  logOutputChannel: TextChannel;
  commands: Collection<string, Command>;
  interaction?: CommandInteraction | ButtonInteraction;
  title?: string;
  timesToRepeat?: number;
  wasFromSlash: boolean;
}

export type CommandContext = {
  message?: Message;
  args: string[];
  discord: Client;
  logOutputChannel: TextChannel;
  commands: Collection<string, Command>;
  interaction?: Interaction;
  title?: string;
  timesToRepeat?: number;
  wasFromSlash?: boolean;
};

export type KnowledgeBaseProps = Pick<
  CommandProps,
  "message" | "args" | "interaction" | "wasFromSlash"
>;

export type RollProps = Pick<
  CommandProps,
  | "message"
  | "args"
  | "logOutputChannel"
  | "interaction"
  | "title"
  | "timesToRepeat"
  | "discord"
>;

export type HelpProps = Pick<CommandProps, "message" | "args" | "commands">;
export type StatusProps = Pick<
  CommandProps,
  "message" | "discord" | "interaction"
>;
export type TitledRollProps = Pick<
  CommandProps,
  "message" | "args" | "logOutputChannel" | "interaction"
>;

export type EmbedObject = {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
};

export interface LogEventProps {
  eventType: EventType;
  logOutputChannel: TextChannel;
  message?: Message;
  command?: Command;
  args?: string[];
  title?: string;
  guild?: Guild;
  resultMessage?: string;
  embedParam: EmbedObject;
  interaction?: CommandInteraction | ButtonInteraction;
  error: Error,
  discord: Client,
  canvasString: string;
}

export interface Die {
  sides: DiceTypes;
  rolled: DiceFaces;
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