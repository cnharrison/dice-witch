import {
  ButtonInteraction,
  Client,
  Collection,
  CommandInteraction,
  EmbedFieldData,
  Guild,
  Message,
  MessageAttachment,
  MessageEmbed,
  TextChannel
} from "discord.js";

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

export type EventType =
  | "receivedCommand"
  | "criticalError"
  | "rollTitleRejected"
  | "rollTitleAccepted"
  | "rollTitleTimeout"
  | "guildAdd"
  | "guildRemove"
  | "sentRollResultMessage"
  | "sentHelperMessage"
  | "sentNeedPermissionsMessage"
  | "sentDiceOverMaxMessage";
export type DiceArray = any;
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
  [K in DiceTypes]: {
    [K in DiceFaces]?: string;
  };
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
>;

export type HelpProps = Pick<CommandProps, "message" | "args" | "commands">;
export type StatusProps = Pick<CommandProps, "message" | "discord" | "interaction">;
export type TitledRollProps = Pick<CommandProps, "message" | "args" | "logOutputChannel" | "interaction">

export type EmbedObject = { embeds: MessageEmbed[]; files: MessageAttachment[] };

export interface LogEventProps {
  eventType: EventType,
  logOutputChannel: TextChannel,
  message?: Message,
  command?: Command,
  args?: string[],
  title?: string,
  guild?: Guild,
  embedParam: EmbedObject,
  interaction?: CommandInteraction | ButtonInteraction
}

export interface Die {
  sides: DiceTypes;
  rolled: DiceFaces;
  icon: Icon[] | null;
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
  [key: string]: EmbedFieldData[];
};
