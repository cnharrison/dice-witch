import chroma from "chroma-js";
import { clearAllCache } from "@napi-rs/canvas";
import {
  DiceArray,
  Die,
  Icon,
} from "../../../shared/types";
import {
  arrowThroughIcon,
  blankIcon,
  bullseyeIcon,
  chevronDownIcon,
  chevronUpIcon,
  critIcon,
  dizzyFaceIcon,
  explosionIcon,
  recycleIcon,
  snowflakeIcon,
  trashcanIcon
} from "../images/icons";

import { drawIcon } from "./methods/drawIcon";
import { generateDie } from "./methods/generateDie";
import { generateIcon } from "./methods/generateIcon";
import { generateDiceAttachment } from "./methods/generateDiceAttachment";
import { processRollGroup } from "./methods/processRollGroup";
import { rollDice } from "./methods/rollDice";
import { generateEmbedMessage } from "./methods/generateEmbedMessage";
import { createEmbed } from "./methods/createEmbed";
import { generateDiceRolledMessage } from "./methods/generateDiceRolledMessage";

export class DiceService {
  private static instance: DiceService;
  protected icons: Map<Icon | null, string>;
  protected iconBufferCache: Map<Icon | null, Buffer> = new Map();
  protected defaultDiceDimension = 150;
  protected defaultIconDimension = 37;
  protected maxRowLength = 10;
  private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.icons = new Map<Icon | null, string>([
      ["trashcan", trashcanIcon],
      ["explosion", explosionIcon],
      ["recycle", recycleIcon],
      ["chevronUp", chevronUpIcon],
      ["chevronDown", chevronDownIcon],
      ["target-success", bullseyeIcon],
      ["critical-success", critIcon],
      ["critical-failure", dizzyFaceIcon],
      ["penetrate", arrowThroughIcon],
      ["unique", snowflakeIcon],
      ["blank", blankIcon],
    ]);

    this.cacheCleanupInterval = setInterval(() => {
      clearAllCache();
    }, 60000);
  }

  public static getInstance(): DiceService {
    if (!DiceService.instance) {
      DiceService.instance = new DiceService();
    }
    return DiceService.instance;
  }
  
  public destroy() {
    clearAllCache();
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.iconBufferCache.clear();
  }

  public getSecondaryColorFromColor(color: chroma.Color) {
    const isDiceColorDark = color.get("lab.l") > 65;
    return isDiceColorDark ? color.brighten(2) : color.darken(2);
  }

  public getTextColorFromColors(color: chroma.Color, secondaryColor: chroma.Color) {
    return color.get("lab.l") + secondaryColor.get("lab.l") / 2 < 65
      ? chroma("#FAF9F6")
      : chroma("#000000");
  }

  public generateIconArray(modifierSet: Set<string> | string[] | undefined): Icon[] | null {
    if (!modifierSet) return null;
    const modifierArray = Array.isArray(modifierSet) ? modifierSet : [...modifierSet];
    if (modifierArray.length === 0) return null;
    return modifierArray.map((item) => {
      switch (item) {
        case "drop": return "trashcan";
        case "explode": return "explosion";
        case "re-roll": 
        case "reroll": return "recycle";
        case "max": return "chevronDown";
        case "min": return "chevronUp";
        case "target-success": return "target-success";
        case "critical-success": return "critical-success";
        case "critical-failure": return "critical-failure";
        case "penetrate": return "penetrate";
        case "unique": return "unique";
        default: return "blank";
      }
    });
  }

  public getIconSpacing(iconArray: Icon[] | null) {
    if (!iconArray) return null;
    switch (iconArray.length) {
      case 1: return 0.375;
      case 2: return 0.26;
      case 3: return 0.19;
      default: return null;
    }
  }

  public getDPercentRolled = (rolled: number): number =>
    rolled === 100 ? 0 : Math.floor(rolled / 10) * 10;

  public getD10PercentRolled = (rolled: number): number =>
    rolled % 10 === 0 ? 10 : rolled % 10;

  public repeatArgs(args: string[], timesToRepeat?: number): string[] {
    if (timesToRepeat) {
      return new Array(timesToRepeat).fill(args).flat();
    }
    return [...args];
  }

  public shouldUsePatternFill(): boolean {
    return Math.random() < 0.4;
  }

  public getIconWidth(index: number, diceIndex: number, iconSpacing: number) {
    return this.defaultDiceDimension * (diceIndex + iconSpacing * (index + 1));
  }

  public getIconHeight(diceOuterIndex: number) {
    return diceOuterIndex * (this.defaultDiceDimension + this.defaultIconDimension) + this.defaultDiceDimension;
  }

  public getCanvasHeight(paginatedArray: DiceArray, shouldHaveIcon: boolean) {
    return shouldHaveIcon
      ? this.defaultDiceDimension * paginatedArray.length +
        this.defaultIconDimension * paginatedArray.length
      : this.defaultDiceDimension * paginatedArray.length;
  }

  public getCanvasWidth(diceArray: DiceArray) {
    const groupLength = diceArray.length === 1
      ? diceArray[0].length
      : Math.max(...diceArray.map(group => group.length));

    return this.defaultDiceDimension * Math.min(groupLength, this.maxRowLength);
  }

  public getDiceWidth(index: number) {
    return this.defaultDiceDimension * index;
  }

  public getDiceHeight(outerIndex: number, shouldHaveIcon: boolean) {
    return outerIndex * this.defaultDiceDimension +
      (shouldHaveIcon ? outerIndex * this.defaultIconDimension : 0);
  }

  public paginateDiceArray(diceArray: DiceArray): DiceArray {
    const paginateDiceGroup = (group: Die[]) =>
      Array.from({ length: Math.ceil(group.length / this.maxRowLength) }, (_, index) =>
        group.slice(index * this.maxRowLength, (index + 1) * this.maxRowLength)
      );

    return diceArray.flatMap(group =>
      group.length > this.maxRowLength ? paginateDiceGroup(group) : [group]
    );
  }

  public drawIcon = drawIcon;
  public generateDie = generateDie;
  public generateIcon = generateIcon;
  public generateDiceAttachment = generateDiceAttachment;
  public processRollGroup = processRollGroup;
  public rollDice = rollDice;
  public generateEmbedMessage = generateEmbedMessage;
  public createEmbed = createEmbed;
  public generateDiceRolledMessage = generateDiceRolledMessage;
}

export default DiceService;
