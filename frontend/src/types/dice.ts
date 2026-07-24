import type { PublicRenderModelV4 } from "@dice-witch/dice-v4-model";

export interface DiceGroup {
  numberOfDice: number;
  diceSize: number | string;
}

export interface Die {
  sides: number | string;
  rolled: number;
  icon: string[];
  color: string;
  secondaryColor: string;
  textColor: string;
  value: number;
}

export interface Result {
  output: string;
  results: number;
}

export interface RenderedRollImage {
  contentType: "image/png";
  width: number;
  height: number;
  base64: string;
}

export interface RollPreparation {
  renderSeed: number;
  appearanceDigest: string;
  groupSizes: number[];
  appearanceIdentities: string[][];
  renderedImage: RenderedRollImage;
  renderModel?: PublicRenderModelV4;
}

export interface RollResponse {
  diceArray: Die[][];
  resultArray: Result[];
  appearanceIdentities: string[][];
  rerolledAppearanceIdentities: string[];
  renderedImage?: RenderedRollImage;
  renderModel?: PublicRenderModelV4;
  error?: string;
  message?: string;
}
