import Canvas, { Canvas as CanvasType, Image } from "@napi-rs/canvas";
import chroma from "chroma-js";
import { AttachmentBuilder } from "discord.js";
import { DiceRoll, Parser, RollResult, StandardDice } from "rpg-dice-roller";
import sharp from "sharp";
import { coinFlip } from "../../shared/helpers";
import {
  DiceArray,
  DiceFaceData,
  DiceFaces,
  DiceTypes,
  DiceTypesToDisplay,
  Die,
  Icon,
  PatternFillObject,
  Result,
} from "../../shared/types";
import {
  generateD10,
  generateD12,
  generateD20,
  generateD4,
  generateD6,
  generateD8,
  generateDPercent,
} from "./images/generateDice/dice";
import generateLinearGradientFill from "./images/generateDice/fills/generateLinearGradientFill";
import generateDie from "./images/generateDie";

export class DiceService {
  private static instance: DiceService;
  private icons: Map<Icon | null, string>;
  private defaultDiceDimension = 100;
  private defaultIconDimension = 25;
  private maxRowLength = 10;

  private constructor() {
    this.icons = new Map<Icon | null, string>([
      ["trashcan", `
      <svg style="enable-background:new 0 0 65 65" version="1.1" xml:space="preserve">
        <style>
          .st1{fill:#fff}
        </style>
        <circle cx="32.5" cy="32.5" r="32" style="fill:#ce2029"/>
        <path class="st1" d="M49.5 14.8h-7.8c-.6-3.3-3.6-5.8-7.1-5.8h-4.3c-3.5 0-6.4 2.5-7.1 5.8h-7.8c-.4 0-.7.3-.7.7v4.8c0 .4.3.7.7.7h34.1c.4 0 .7-.3.7-.7v-4.8c0-.4-.3-.7-.7-.7zM30.4 12h4.3c1.8 0 3.4 1.1 4 2.8H26.3c.7-1.7 2.2-2.8 4.1-2.8zM18.1 53.9c0 1.1 1 2.1 2.2 2.1h24.5c1.2 0 2.2-.9 2.2-2.1V24.5H18.1v29.4zM39 30.5h3.8v18.7H39V30.5zm-8.4 0h3.8v18.7h-3.8V30.5zm-8.4 0H26v18.7h-3.8V30.5z"/>
      </svg>
      `],
      ["explosion", `
      <svg>
          <path d="M94.632 36.003 300.171 193.53l41.846-148.914 59.076 151.375 163.693-141.53-88.616 183.374 140.308-4.923L525.4 347.367l121.846 78.764-145.23 2.462 128 153.836-183.385-84.918-19.692 164.913-89.846-132.915-125.539 171.066 12.308-214.14-171.077 34.46 107.077-140.3-87.384-142.76 121.846 23.384L94.632 36.003z" style="fill:red;stroke:none"/>
          <path d="m160.199 118.798 154.324 118.277 31.419-111.808 44.357 113.656L513.204 132.66l-66.535 137.68 105.347-3.696-68.383 85.935 91.485 59.139-109.043 1.848 96.106 115.505-137.69-63.759-14.786 123.821-67.46-99.796-94.257 128.442 9.24-160.783L128.78 482.87l80.397-105.34-65.611-107.19 91.485 17.558-74.851-169.1z" style="fill:#ff8000;stroke:none"/>
          <path d="m226.237 204.21 99.102 75.954 20.176-71.8L374 281.35l78.926-68.24-42.727 88.416 67.65-2.374-43.913 55.185 58.75 37.977-70.025 1.187 61.716 74.174-88.42-40.944-9.495 79.514-43.32-64.086-60.53 82.481 5.934-103.25-82.486 16.615 51.628-67.646-42.133-68.833 58.75 11.274-48.068-108.59z" style="fill:#ff0;stroke:none"/>
          <path d="M-57.96 305.26a30.912 30.912 0 1 1-61.825 0 30.912 30.912 0 1 1 61.824 0z" transform="translate(435.349 54.097)" style="fill:#000;fill-opacity:1;stroke:none"/>
      </svg>
      `],
      ["recycle", `
      <svg>
          <path fill="#026921" d="M184.561 261.903c3.232 13.997-12.123 24.635-24.068 17.168l-40.736-25.455-50.867 81.402C55.606 356.273 70.96 384 96.012 384H148c6.627 0 12 5.373 12 12v40c0 6.627-5.373 12-12 12H96.115c-75.334 0-121.302-83.048-81.408-146.88l50.822-81.388-40.725-25.448c-12.081-7.547-8.966-25.961 4.879-29.158l110.237-25.45c8.611-1.988 17.201 3.381 19.189 11.99l25.452 110.237zm98.561-182.915 41.289 66.076-40.74 25.457c-12.051 7.528-9 25.953 4.879 29.158l110.237 25.45c8.672 1.999 17.215-3.438 19.189-11.99l25.45-110.237c3.197-13.844-11.99-24.719-24.068-17.168l-40.687 25.424-41.263-66.082c-37.521-60.033-125.209-60.171-162.816 0l-17.963 28.766c-3.51 5.62-1.8 13.021 3.82 16.533l33.919 21.195c5.62 3.512 13.024 1.803 16.536-3.817l17.961-28.743c12.712-20.341 41.973-19.676 54.257-.022zM497.288 301.12l-27.515-44.065c-3.511-5.623-10.916-7.334-16.538-3.821l-33.861 21.159c-5.62 3.512-7.33 10.915-3.818 16.536l27.564 44.112c13.257 21.211-2.057 48.96-27.136 48.96H320V336.02c0-14.213-17.242-21.383-27.313-11.313l-80 79.981c-6.249 6.248-6.249 16.379 0 22.627l80 79.989C302.689 517.308 320 510.3 320 495.989V448h95.88c75.274 0 121.335-82.997 81.408-146.88z"/>
      </svg>
      `],
      ["chevronUp", `
      <svg>
        <path fill="#66ff00" d="M8 256C8 119 119 8 256 8s248 111 248 248-111 248-248 248S8 393 8 256zm231-113.9L103.5 277.6c-9.4 9.4-9.4 24.6 0 33.9l17 17c9.4 9.4 24.6 9.4 33.9 0L256 226.9l101.6 101.6c9.4 9.4 24.6 9.4 33.9 0l17-17c9.4-9.4 9.4-24.6 0-33.9L273 142.1c-9.4-9.4-24.6-9.4-34 0z"/>
      </svg>
      `],
      ["chevronDown", `
      <svg>
        <path fill="#ce2029" d="M504 256c0 137-111 248-248 248S8 393 8 256 119 8 256 8s248 111 248 248zM273 369.9l135.5-135.5c9.4-9.4 9.4-24.6 0-33.9l-17-17c-9.4-9.4-24.6-9.4-33.9 0L256 285.1 154.4 183.5c-9.4-9.4-24.6-9.4-33.9 0l-17 17c-9.4 9.4-9.4 24.6 0 33.9L239 369.9c9.4 9.4 24.6 9.4 34 0z"/>
      </svg>
      `],
      ["bullseye", `
      <svg>
        <g>
        <path fill="#ce2029" d="M248 320a64.07 64.07 0 0 1-64-64c0-28.95 19.45-53.19 45.88-61.07L285 139.79l-2.12-6.38c-11.15-3.17-22.7-5.41-34.88-5.41a128 128 0 1 0 128 128c0-12.18-2.24-23.73-5.42-34.89l-6.37-2.11-55.14 55.14A63.85 63.85 0 0 1 248 320zm236.43-138.9-35.5 35.5a52.13 52.13 0 0 1-19.17 12.07c15.9 101.19-53.24 196.1-154.43 212s-196.1-53.25-212-154.43 53.25-196.1 154.43-212a185.71 185.71 0 0 1 57.88.05 52 52 0 0 1 11.76-19.22l35.5-35.5A247.87 247.87 0 0 0 248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248a247.87 247.87 0 0 0-11.57-74.9z" opacity=".4"/>
        <path fill="#87ceeb" d="M310 77.7 373.68 14a20.56 20.56 0 0 1 34 8l18.55 55.65 55.66 18.55a20.56 20.56 0 0 1 8 34L426.3 194a20.58 20.58 0 0 1-21 5l-49.7-16.57L265 273a24 24 0 0 1-34-34l90.59-90.59L305 98.71a20.58 20.58 0 0 1 5-21.01z"/>
        </g>
      </svg>
      `],
      ["crit", `
      <svg style="enable-background:new 0 0 256 256" xml:space="preserve" >
        <style>
        .st0{fill:#ff4397}.st1{fill:#e12579}.st2{fill:#ff61b5}.st3{fill:#690589}.st4{fill:#fcc24c}
        </style>
        <path class="st4" d="m128.08 60.925 51.405-56.803-3.999 76.505L252 76.811l-56.925 51.269 56.802 51.405-76.504-3.999L179.189 252l-51.269-56.925-51.405 56.803 3.999-76.505L4 179.189l56.925-51.269L4.122 76.515l76.505 3.999L76.811 4z"/>
        <path class="st3" d="M179.189 254a2.002 2.002 0 0 1-1.487-.661l-49.786-55.279-49.918 55.16a1.998 1.998 0 0 1-3.479-1.446l3.883-74.293L4.1 181.187a1.984 1.984 0 0 1-1.948-1.234 2 2 0 0 1 .51-2.249l55.279-49.787-55.16-49.919a2.001 2.001 0 0 1 1.446-3.48L78.519 78.4 74.813 4.1a2 2 0 0 1 3.484-1.438l49.786 55.279 49.918-55.16a1.998 1.998 0 0 1 3.479 1.446l-3.883 74.293 74.302-3.706a1.988 1.988 0 0 1 1.948 1.234 2 2 0 0 1-.51 2.249l-55.279 49.787 55.16 49.918a2.001 2.001 0 0 1-1.446 3.48L177.48 177.6l3.706 74.301a2 2 0 0 1-1.997 2.099zm-51.269-60.925c.549-.01 1.107.24 1.486.661l47.505 52.746-3.536-70.896a2 2 0 0 1 2.102-2.097l70.888 3.705-52.632-47.631a1.999 1.999 0 0 1 .004-2.969l52.746-47.506-70.897 3.536a1.998 1.998 0 0 1-2.097-2.102l3.705-70.889-47.631 52.633a2 2 0 0 1-1.483.658h-.002a2.003 2.003 0 0 1-1.484-.661L79.089 9.518l3.536 70.896a2.005 2.005 0 0 1-.585 1.516 1.99 1.99 0 0 1-1.517.581L9.635 78.806l52.632 47.631a1.999 1.999 0 0 1-.004 2.969L9.518 176.912l70.897-3.536a2.002 2.002 0 0 1 2.097 2.102l-3.705 70.889 47.631-52.633c.378-.42.917-.659 1.482-.659zM92.378 175.188a11.2 11.2 0 0 1-7.972-3.303 11.2 11.2 0 0 1-3.302-7.972 11.2 11.2 0 0 1 3.302-7.971 11.196 11.196 0 0 1 7.971-3.303c3.012 0 5.843 1.173 7.972 3.303a11.2 11.2 0 0 1 3.302 7.971 11.2 11.2 0 0 1-3.302 7.972 11.193 11.193 0 0 1-7.971 3.303zm0-18.548a7.227 7.227 0 0 0-5.143 2.131 7.225 7.225 0 0 0-2.131 5.143 7.23 7.23 0 0 0 2.13 5.144 7.227 7.227 0 0 0 5.143 2.131c1.943 0 3.77-.757 5.143-2.131a7.225 7.225 0 0 0 2.13-5.144 7.23 7.23 0 0 0-2.13-5.143 7.217 7.217 0 0 0-5.142-2.131z"/>
        <path class="st3" d="M99.1 159.521a2 2 0 0 1-1.414-3.414L202.604 51.188a2 2 0 1 1 2.828 2.828L100.514 158.935c-.39.39-.903.586-1.414.586zM80.903 185.996a1.99 1.99 0 0 1-1.414-.586l-8.607-8.607a2 2 0 1 1 2.828-2.828l8.607 8.607a2 2 0 0 1-1.414 3.414zM70.452 196.446a1.99 1.99 0 0 1-1.414-.586l-8.606-8.606a2 2 0 1 1 2.828-2.828l8.606 8.606a2 2 0 0 1-1.414 3.414z"/>
      </svg>
      `],
      ["dizzyFace", `
      <svg>
          <path fill="#ce2029" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-33.8-217.9c7.8-7.8 7.8-20.5 0-28.3L196.3 192l17.9-17.9c7.8-7.8 7.8-20.5 0-28.3-7.8-7.8-20.5-7.8-28.3 0L168 163.7l-17.8-17.8c-7.8-7.8-20.5-7.8-28.3 0-7.8 7.8-7.8 20.5 0 28.3l17.9 17.9-17.9 17.9c-7.8 7.8-7.8 20.5 0 28.3 7.8 7.8 20.5 7.8 28.3 0l17.8-17.8 17.8 17.8c7.8 7.8 20.5 7.8 28.3 0 7.8-7.8 7.8-20.5 0-28.3l-17.8-18 17.9-17.9c7.7-7.8 7.7-20.4 0-28.2zM248 272c-35.3 0-64 28.7-64 64s28.7 64 64 64 64-28.7 64-64-28.7-64-64-64z"/>
      </svg>
      `],
      ["arrowThrough", `
      <svg style="enable-background:new 0 0 64 64" viewBox="0 0 64 64" xml:space="preserve">
          <path style="fill:none;stroke:#d9dce1;stroke-width:6;stroke-linecap:square;stroke-miterlimit:10" d="M47.54 32H10"/>
          <path style="fill:#d9dce1" d="M46.07 42.93V21.07L57 32z"/>
          <ellipse cx="28" cy="32" rx="7.5" ry="16" style="fill-rule:evenodd;clip-rule:evenodd;fill:none;stroke:#56aaff;stroke-width:6;stroke-linecap:square;stroke-miterlimit:10"/>
          <path style="fill-rule:evenodd;clip-rule:evenodd;fill:none;stroke:#d9dce1;stroke-width:6;stroke-linecap:square;stroke-miterlimit:10" d="M28.65 32h12.21"/>
      </svg>
      `],
      ["blank", `
      <svg height="100" width="100">
      </svg>
      `],
    ]);
  }

  public static getInstance(): DiceService {
    if (!DiceService.instance) {
      DiceService.instance = new DiceService();
    }
    return DiceService.instance;
  }

  private getSecondaryColorFromColor(color: chroma.Color) {
    const isDiceColorDark = color.get("lab.l") > 65;
    return isDiceColorDark ? color.brighten(2) : color.darken(2);
  }

  private getTextColorFromColors(color: chroma.Color, secondaryColor: chroma.Color) {
    return color.get("lab.l") + secondaryColor.get("lab.l") / 2 < 65
      ? chroma("#FAF9F6")
      : chroma("#000000");
  }

  private generateIconArray(modifierSet: Set<string>): Icon[] | null {
    if (modifierSet.size === 0) return null;
    return [...modifierSet].map((item) => {
      switch (item) {
        case "drop": return "trashcan";
        case "explode": return "explosion";
        case "re-roll": return "recycle";
        case "max": return "chevronDown";
        case "min": return "chevronUp";
        case "target-success": return "bullseye";
        case "critical-success": return "crit";
        case "critical-failure": return "dizzyFace";
        case "penetrate": return "arrowThrough";
        default: return "blank";
      }
    });
  }

  private getIconSpacing(iconArray: Icon[] | null) {
    if (!iconArray) return null;
    switch (iconArray.length) {
      case 1: return 0.375;
      case 2: return 0.26;
      case 3: return 0.19;
      default: return null;
    }
  }

  private getDPercentRolled = (rolled: number): number =>
    rolled === 100 ? 0 : Math.floor(rolled / 10) * 10;

  private getD10PercentRolled = (rolled: number): number =>
    rolled % 10 === 0 ? 10 : rolled % 10;

  private repeatArgs(args: string[], timesToRepeat?: number): string[] {
    if (timesToRepeat) {
      return new Array(timesToRepeat).fill(args).flat();
    }
    return [...args];
  }

  private processRollGroup(
    rollGroup: any,
    sidesArray: number[],
    outerIndex: number,
  ): Die[] {
    const sides = sidesArray[outerIndex];
    if (sides === 100) {
      return rollGroup.rolls.reduce((acc: Die[], cur: RollResult) => {
        const isHeads = coinFlip();
        const color = chroma.random();
        const secondaryColor = isHeads
          ? this.getSecondaryColorFromColor(color)
          : chroma.random();
        const textColor = this.getTextColorFromColors(color, secondaryColor);
        const icon = this.generateIconArray(cur.modifiers);
        acc.push(
          {
            sides: "%",
            rolled: this.getDPercentRolled(cur.initialValue) as DiceFaces,
            icon,
            iconSpacing: 0.89,
            color,
            secondaryColor,
            textColor,
          },
          {
            sides: 10,
            rolled: this.getD10PercentRolled(cur.initialValue) as DiceFaces,
            color,
            secondaryColor,
            textColor,
          }
        );
        return acc;
      }, []);
    } else {
      return rollGroup.rolls.map((currentRoll: RollResult) => {
        const isHeads = coinFlip();
        const color = chroma.random();
        const secondaryColor = isHeads
          ? this.getSecondaryColorFromColor(color)
          : chroma.random();
        const textColor = this.getTextColorFromColors(color, secondaryColor);
        const icon = this.generateIconArray(currentRoll.modifiers);
        const iconSpacing = this.getIconSpacing(icon);
        return {
          sides,
          rolled: currentRoll.initialValue,
          icon,
          iconSpacing,
          color,
          secondaryColor,
          textColor,
        };
      });
    }
  }

  public rollDice(
    args: string[],
    availableDice: DiceTypesToDisplay[],
    timesToRepeat?: number
  ): {
    diceArray: DiceArray;
    resultArray: Result[];
    shouldHaveImage?: boolean;
  } {
    let diceArray: DiceArray = [];
    let shouldHaveImageArray: boolean[] = [];
    let resultArray: Result[] = [];
    const lowerCaseArgs = args.map((arg) => arg.toLowerCase());
    const argsToMutate = this.repeatArgs(lowerCaseArgs, timesToRepeat);

    try {
      argsToMutate.forEach((value) => {
        let parsedRoll;

        try {
          parsedRoll = Parser.parse(value);
        } catch (err) {
          console.error(err);
          return;
        }

        const sidesArray = parsedRoll
          ? parsedRoll.reduce((acc: number[], rollGroup: StandardDice) => {
              if (typeof rollGroup === "object") {
                acc.push(rollGroup.sides);
              }
              return acc;
            }, [])
          : [];

        const shouldHaveImage = sidesArray.every((sides: any) =>
          availableDice.includes(sides)
        );

        if (parsedRoll) {
          const roll = new DiceRoll(value);
          const result: Result = {
            output: roll.output,
            results: roll.total,
          };

          const groupArray = roll.rolls.reduce((acc: Die[], rollGroup, outerIndex: number) => {
            if (typeof rollGroup !== "string" && typeof rollGroup !== "number") {
              acc.push(...this.processRollGroup(rollGroup, sidesArray, outerIndex));
            }
            return acc;
          }, []);

          diceArray.push([...groupArray]);
          resultArray.push(result);
          shouldHaveImageArray.push(shouldHaveImage);
        }
      });

      const shouldHaveImage = shouldHaveImageArray.every(
        (value: boolean) => value
      );

      return {
        diceArray,
        resultArray,
        shouldHaveImage,
      };
    } catch (err) {
      console.error(err);
      return { diceArray: [], resultArray: [] };
    }
  }

  private getIconWidth(index: number, diceIndex: number, iconSpacing: number) {
    return this.defaultDiceDimension * (diceIndex + iconSpacing * (index + 1));
  }

  private getIconHeight(diceOuterIndex: number) {
    return diceOuterIndex * (this.defaultDiceDimension + this.defaultIconDimension) + this.defaultDiceDimension;
  }

  private async drawIcon(
    iconArray: Icon[] | null | undefined,
    iconSpacing: number,
    ctx,
    diceIndex: number,
    diceOuterIndex: number
  ): Promise<void> {
    if (!iconArray) return;

    await Promise.all(iconArray.map(async (icon, index) => {
      try {
        const iconToLoad = await this.generateIcon(icon);
        const iconWidth = this.getIconWidth(index, diceIndex, iconSpacing);
        const iconHeight = this.getIconHeight(diceOuterIndex);
        const iconImage = await Canvas.loadImage(iconToLoad as Buffer);
        ctx.drawImage(
          iconImage,
          iconWidth,
          iconHeight,
          this.defaultIconDimension,
          this.defaultIconDimension
        );
      } catch (error) {
        console.error(`Error loading icon: ${icon}`, error);
      }
    }));
  }

  private getCanvasHeight(paginatedArray: DiceArray, shouldHaveIcon: boolean) {
    return shouldHaveIcon
      ? this.defaultDiceDimension * paginatedArray.length +
        this.defaultIconDimension * paginatedArray.length
      : this.defaultDiceDimension * paginatedArray.length;
  }

  private getCanvasWidth(diceArray: DiceArray) {
    const groupLength = diceArray.length === 1
      ? diceArray[0].length
      : Math.max(...diceArray.map(group => group.length));

    return this.defaultDiceDimension * Math.min(groupLength, this.maxRowLength);
  }

  private getDiceWidth(index: number) {
    return this.defaultDiceDimension * index;
  }

  private getDiceHeight(outerIndex: number, shouldHaveIcon: boolean) {
    return outerIndex * this.defaultDiceDimension +
      (shouldHaveIcon ? outerIndex * this.defaultIconDimension : 0);
  }

  private paginateDiceArray(diceArray: DiceArray): DiceArray {
    const paginateDiceGroup = (group: Die[]) =>
      Array.from({ length: Math.ceil(group.length / this.maxRowLength) }, (_, index) =>
        group.slice(index * this.maxRowLength, (index + 1) * this.maxRowLength)
      );

    return diceArray.flatMap(group =>
      group.length > this.maxRowLength ? paginateDiceGroup(group) : [group]
    );
  }

  public async generateDiceAttachment(
    diceArray: DiceArray
  ): Promise<{ attachment: AttachmentBuilder; canvas: CanvasType } | undefined> {
    try {
      const shouldHaveIcon = diceArray.some(group => group.some(die => !!die.icon?.length));
      const paginatedArray = this.paginateDiceArray(diceArray);
      const canvasHeight = this.getCanvasHeight(paginatedArray, shouldHaveIcon);
      const canvasWidth = this.getCanvasWidth(paginatedArray);
      const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext("2d");

      const drawDice = async (die: Die, index: number, outerIndex: number) => {
       const toLoad = await generateDie(
        die.sides,
        die.rolled,
        die.textColor.hex(),
        "#000000",
        undefined,
        generateLinearGradientFill(die.color.hex(), die.secondaryColor.hex())
      );
        const image = await Canvas.loadImage(toLoad as Buffer);
        const diceWidth = this.getDiceWidth(index);
        const diceHeight = this.getDiceHeight(outerIndex, shouldHaveIcon);
        ctx.drawImage(
          image as unknown as Image,
          diceWidth,
          diceHeight,
          this.defaultDiceDimension,
          this.defaultDiceDimension
        );
        if (shouldHaveIcon && die.iconSpacing) {
          await this.drawIcon(die.icon, die.iconSpacing, ctx, index, outerIndex);
        }
      };

      await Promise.all(
        paginatedArray.map((array, outerIndex) =>
          Promise.all(array.map((die, index) => drawDice(die, index, outerIndex)))
        )
      );

      const attachment = new AttachmentBuilder(
        canvas.toBuffer('image/webp'),
        { name: "currentDice.png" }
      );
      return { attachment, canvas };
    } catch (err) {
      console.error("Error generating dice attachment:", err);
      return undefined;
    }
  }

  public async generateDie({
    sides,
    rolled,
    textColor,
    outlineColor,
    solidFill,
    patternFill,
    borderWidth,
    width,
    height
  }: {
    sides: DiceTypes;
    rolled: DiceFaces;
    textColor?: string;
    outlineColor?: string;
    solidFill?: string;
    patternFill?: PatternFillObject;
    borderWidth?: string;
    width?: string;
    height?: string;
  }): Promise<Buffer | undefined> {
    const props = {
      result: rolled,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    };

    const dice: DiceFaceData = {
      20: generateD20(props),
      12: generateD12(props),
      10: generateD10(props),
      8: generateD8(props),
      6: generateD6(props),
      4: generateD4(props),
      "%": generateDPercent(props),
    };

    const image = dice[sides];

    if (!image) {
      console.error("Failed to generate image");
      return undefined;
    }

    try {
      const attachment = await sharp(Buffer.from(image)).webp({ lossless: true, quality: 100 }).toBuffer();
      return attachment;
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  public async generateIcon(iconType: Icon | null): Promise<Buffer | undefined> {
    try {
      const image = this.icons.get(iconType) || this.icons.get(null);
      if (!image) return;

      const attachment = await sharp(Buffer.from(image))
        .webp({ lossless: true, quality: 100 })
        .toBuffer();
      return attachment;
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }
}