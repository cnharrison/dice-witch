export interface DiceGroup {
  numberOfDice: number;
  diceSize: number;
}

export interface Die {
  sides: number;
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
  shouldHaveImage?: boolean;
  imageData?: string;
  message?: string;
}
