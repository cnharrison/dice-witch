export type icon =
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

export interface die {
  sides?: number | "%";
  rolled?: number;
  icon?: icon[] | null;
}

export interface result {
  output?: string;
  results?: number;
}
