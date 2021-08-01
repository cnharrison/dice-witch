import {
  Client,
  Collection,
  CommandInteraction,
  EmbedFieldData,
  Message,
  TextChannel,
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
  execute: (
    message: Message,
    args: string[],
    discord: Client,
    logOutputChannel: TextChannel,
    commands?: Collection<string, Command>,
    interaction?: CommandInteraction,
    title?: string
  ) => void;
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
