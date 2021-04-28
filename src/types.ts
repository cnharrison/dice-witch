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

export type EventType = "receivedCommand" | "criticalError" | "rollTitleRejected" | "rollTitleAccepted" | "rollTitleTimeout" | "guildAdd" | "guildRemove" | "sentRollResultMessage" | "sentHelperMessage" | "sentNeedPermissionsMessage"

export interface Die {
  sides?: number | "%";
  rolled?: number;
  icon?: Icon[] | null;
}

export interface Result {
  output?: string;
  results?: number;
}

export interface Command {
  name: string;
  alises: string[];
  description: string;
  usage: string;
  execute: () => void
}

