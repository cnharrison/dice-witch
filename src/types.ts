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
  | "sentNeedPermissionsMessage";

export type DiceTypes = 20 | 12 | 10 | 8 | 6 | 4 | "%";
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
    [K in DiceFaces]?: DieGenerator;
  };
};
export interface Result {
  output?: string;
  results?: number;
}

export interface Command {
  name: string;
  alises: string[];
  description: string;
  usage: string;
  execute: () => void;
}

export interface Die {
  sides: DiceTypes;
  rolled: DiceFaces;
  icon: Icon[] | null;
}
