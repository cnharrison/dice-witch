export interface DiceGroup {
  numberOfDice: number;
  diceSize: number | string;
}

export interface Die {
  sides: number | string;
  rolled: number;
  icon?: string[] | null;
  iconSpacing?: number;
  color: string;
  secondaryColor: string;
  textColor: string;
  value: number;
}

export interface Result {
  output: string;
  results: number;
}

export interface RollResponse {
  diceArray: Die[][];
  resultArray: Result[];
  message?: string;
}
