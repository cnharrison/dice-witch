import Canvas, { Canvas as CanvasType, Image } from "@napi-rs/canvas";
import chroma from "chroma-js";
import { AttachmentBuilder, ButtonInteraction, CommandInteraction, EmbedBuilder } from "discord.js";
import { DiceRoll, Parser } from "rpg-dice-roller";

interface DiceRollResult {
  initialValue?: string;
  modifiers?: string[];
  rolls: any[];
  total: number;
  output: string;
}
import sharp from "sharp";
import { coinFlip, getRandomNumber, pluralPick } from "../../shared/helpers";
import {
  DiceArray,
  DiceFaceData,
  DiceFaces,
  DiceTypesToDisplay,
  Die,
  GenerateEmbedMessageParams,
  Icon,
  PatternFillObject,
  Result,
} from "../../shared/types";
import { tabletopColor } from "../constants";
import {
  generateD10,
  generateD12,
  generateD20,
  generateD4,
  generateD6,
  generateD8,
  generateDPercent,
  generateGeneric,
} from "./images/generateDice/dice";
import generateLinearGradientFill from "./images/generateDice/fills/generateLinearGradientFill";
import { getRandomPatternFill } from "./images/generateDice/fills/generatePatternFills";
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
  trashcanIcon
} from "./images/icons";

export class DiceService {
  private static instance: DiceService;
  private icons: Map<Icon | null, string>;
  private iconCache: Map<Icon | null, Buffer>;
  private diceCache: Map<string, Buffer>;
  private defaultDiceDimension = 150;
  private defaultIconDimension = 37;
  private maxRowLength = 10;
  private readonly MAX_ICON_CACHE_SIZE = 20;
  private readonly MAX_DICE_CACHE_SIZE = 100;

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
      ["blank", blankIcon],
    ]);
    this.iconCache = new Map<Icon | null, Buffer>();
    this.diceCache = new Map<string, Buffer>();
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

  private generateIconArray(modifierSet: Set<string> | string[] | undefined): Icon[] | null {
    if (!modifierSet) return null;
    const modifierArray = Array.isArray(modifierSet) ? modifierSet : [...modifierSet];
    if (modifierArray.length === 0) return null;
    return modifierArray.map((item) => {
      switch (item) {
        case "drop": return "trashcan";
        case "explode": return "explosion";
        case "re-roll": return "recycle";
        case "max": return "chevronDown";
        case "min": return "chevronUp";
        case "target-success": return "target-success";
        case "critical-success": return "critical-success";
        case "critical-failure": return "critical-failure";
        case "penetrate": return "penetrate";
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

  private shouldUsePatternFill(): boolean {
    return Math.random() < 0.4;
  }

  private processRollGroup(
    rollGroup: any,
    sides: number,
  ): Die[] {
    if (!rollGroup || !rollGroup.rolls) {
      return [];
    }

    if (sides === undefined) {
      return rollGroup.rolls.map((currentRoll: DiceRollResult) => {
        if (!currentRoll) return null;

        const isHeads = coinFlip();
        const color = chroma.random();
        const secondaryColor = isHeads
          ? this.getSecondaryColorFromColor(color)
          : chroma.random();
        const textColor = this.getTextColorFromColors(color, secondaryColor);
        const initialValue = 
          typeof currentRoll.initialValue === 'number' ? currentRoll.initialValue :
          typeof currentRoll.initialValue === 'string' ? parseInt(currentRoll.initialValue, 10) || 0 : 
          0;
          
        return {
          sides: 6,
          rolled: initialValue as DiceFaces,
          icon: null,
          iconSpacing: 0,
          color,
          secondaryColor,
          textColor,
          value: initialValue,
        };
      }).filter(Boolean);
    }

    if (sides === 100) {
      return rollGroup.rolls.reduce((acc: Die[], cur: DiceRollResult) => {
        if (!cur) return acc;

        const isHeads = coinFlip();
        const color = chroma.random();
        const secondaryColor = isHeads
          ? this.getSecondaryColorFromColor(color)
          : chroma.random();
        const textColor = this.getTextColorFromColors(color, secondaryColor);
        const icon = this.generateIconArray(cur.modifiers);

        const initialValue = typeof cur.initialValue === 'string' ? parseInt(cur.initialValue, 10) : (cur.initialValue || 0);

        acc.push(
          {
            sides: "%",
            rolled: this.getDPercentRolled(initialValue) as DiceFaces,
            icon,
            iconSpacing: 0.89,
            color,
            secondaryColor,
            textColor,
            value: Number(initialValue),
          },
          {
            sides: 10,
            rolled: this.getD10PercentRolled(initialValue) as DiceFaces,
            color,
            secondaryColor,
            textColor,
            value: Number(initialValue),
          }
        );
        return acc;
      }, []);
    } else {
      return rollGroup.rolls.map((currentRoll: DiceRollResult) => {
        if (!currentRoll) return null;

        const isHeads = coinFlip();
        const color = chroma.random();
        const secondaryColor = isHeads
          ? this.getSecondaryColorFromColor(color)
          : chroma.random();
        const textColor = this.getTextColorFromColors(color, secondaryColor);
        const icon = this.generateIconArray(currentRoll.modifiers);
        const iconSpacing = this.getIconSpacing(icon);

        const initialValue = currentRoll.initialValue || 0;

        return {
          sides,
          rolled: initialValue,
          icon,
          iconSpacing,
          color,
          secondaryColor,
          textColor,
          value: initialValue,
        };
      }).filter(Boolean);
    }
  }

  public async rollDice(
    args: string[],
    _availableDice: DiceTypesToDisplay[],
    timesToRepeat?: number
  ): Promise<{
    diceArray: DiceArray;
    resultArray: Result[];
    errors?: string[];
    files?: AttachmentBuilder[];
  }> {
    let diceArray: DiceArray = [];
    let resultArray: Result[] = [];
    let errors: string[] = [];
    let files: AttachmentBuilder[] = [];
    const lowerCaseArgs = args.map((arg) => arg.toLowerCase());
    const argsToMutate = this.repeatArgs(lowerCaseArgs, timesToRepeat);

    try {
      for (const value of argsToMutate) {
        let parsedRoll;

        try {
          parsedRoll = Parser.parse(value);
        } catch (err) {
          errors.push(`Invalid notation: ${value}`);
          continue;
        }

        const rollGroupSidesMap = new Map();
        if (parsedRoll && Array.isArray(parsedRoll)) {
          parsedRoll.forEach((group, index) => {
            if (typeof group === 'object' && group.sides) {
              rollGroupSidesMap.set(index, group.sides);
            }
          });
        }

        let roll;
        try {
          roll = new DiceRoll(value);
        } catch (err) {
          errors.push(`Invalid notation when rolling: ${value}`);
          continue;
        }
        const result: Result = {
          output: roll.output,
          results: roll.total,
        };

        let groupArray = [];


        if (value.includes('{') || value.includes('k') || value.includes('d')) {
          const dicePatterns: { count: number, sides: number }[] = [];
          const diceRegex = /(\d*)d(\d+|\%)(?:k|d|cs|cf)?(?:=|<=|>=|<|>)?(\d+)?/gi;
          let match;

          while ((match = diceRegex.exec(value)) !== null) {
            dicePatterns.push({
              count: match[1] === "" ? 1 : parseInt(match[1]),
              sides: match[2] === '%' ? 100 : parseInt(match[2])
            });
          }

          const processOutput = () => {
            const rollOutput = roll.output;
            const diceGroups = rollOutput.match(/\[([^\]]+)\]/g) || [];

            for (let i = 0; i < dicePatterns.length && i < diceGroups.length; i++) {
              const pattern = dicePatterns[i];
              const diceGroup = diceGroups[i];

              const dieValues = diceGroup.replace(/[\[\]{}]/g, '')
                               .split(',')
                               .map(v => v.trim());

              const count = pattern.count;
              const sides = pattern.sides;

              for (let j = 0; j < Math.max(count, dieValues.length); j++) {
                const dieValueStr = j < dieValues.length ? dieValues[j] : '';

                const isDropped = dieValueStr.endsWith('d');
                const isPenetrating = dieValueStr.includes('!p');
                const isExploded = dieValueStr.includes('!') && !isPenetrating;
                const isCritSuccess = /\*\*$/.test(dieValueStr);
                const isCritFailure = /__.*$/.test(dieValueStr);
                const isTargetSuccess = dieValueStr.includes('*') && !/\*\*$/.test(dieValueStr);
                const isRerolled = dieValueStr.includes('r');

                let valueStr = dieValueStr;
                if (isDropped) valueStr = valueStr.slice(0, -1);
                if (isPenetrating) valueStr = valueStr.replace(/!p/g, '');
                else if (isExploded) valueStr = valueStr.replace(/!/g, '');
                if (isCritSuccess) valueStr = valueStr.replace(/\*\*$/, '');
                if (isCritFailure) valueStr = valueStr.replace(/__/g, '');
                if (isTargetSuccess) valueStr = valueStr.replace(/\*/g, '');
                if (isRerolled) valueStr = valueStr.replace(/r/g, '');

                const dieValue = parseInt(valueStr, 10);

                const value = isNaN(dieValue) ? Math.floor(Math.random() * sides) + 1 : dieValue;

                const isHeads = coinFlip();
                const color = chroma.random();
                const secondaryColor = isHeads ? this.getSecondaryColorFromColor(color) : chroma.random();
                const textColor = this.getTextColorFromColors(color, secondaryColor);

                const icons = [];

                if (isDropped) {
                  icons.push("trashcan");
                }
                if (isPenetrating) {
                  icons.push("penetrate");
                } else if (isExploded) {
                  icons.push("explosion");
                }
                if (isCritSuccess) {
                  icons.push("critical-success");
                }
                if (isCritFailure) {
                  icons.push("critical-failure");
                }
                if (isTargetSuccess) {
                  icons.push("target-success");
                }
                if (isRerolled) {
                  icons.push("recycle");
                }

                const icon = icons.length > 0 ? icons : null;
                const iconSpacing = icons.length > 0 ? 0.375 : null;

                let adjustedColor = color;
                if (isCritSuccess) {
                  adjustedColor = chroma('#ffcc00');
                } else if (isCritFailure) {
                  adjustedColor = chroma('#ff3333');
                }

                // Handle d% (percentile dice) as two dice: d% and d10
                if (sides === 100 || pattern.sides === 100) {
                  groupArray.push({
                    sides: "%",
                    rolled: this.getDPercentRolled(value) as DiceFaces,
                    icon,
                    iconSpacing: 0.89,
                    color: adjustedColor,
                    secondaryColor,
                    textColor,
                    value
                  });

                  groupArray.push({
                    sides: 10,
                    rolled: this.getD10PercentRolled(value) as DiceFaces,
                    color: adjustedColor,
                    secondaryColor,
                    textColor,
                    value
                  });
                } else {
                  groupArray.push({
                    sides,
                    rolled: value,
                    icon,
                    iconSpacing,
                    color: adjustedColor,
                    secondaryColor,
                    textColor,
                    value
                  });
                }
              }
            }
          };

          processOutput();

          if (groupArray.length === 0) {
            const outputGroups = roll.output.match(/\[([^\]]+)\]/g) || [];

            for (let i = 0; i < outputGroups.length; i++) {
              const group = outputGroups[i];
              let diceSize = i < dicePatterns.length ? dicePatterns[i].sides : 20;

              const diceValues = group.replace(/[\[\]{}]/g, '')
                              .split(',')
                              .map(v => v.trim());

              diceValues.forEach(dieValue => {
                const isDropped = dieValue.endsWith('d');
                const isPenetrating = dieValue.includes('!p');
                const isExploded = dieValue.includes('!') && !isPenetrating;
                const isCritSuccess = /\*\*$/.test(dieValue);
                const isCritFailure = /__.*$/.test(dieValue);
                const isTargetSuccess = dieValue.includes('*') && !/\*\*$/.test(dieValue);
                const isRerolled = dieValue.includes('r');

                let valueStr = dieValue;
                if (isDropped) valueStr = valueStr.slice(0, -1);
                if (isPenetrating) valueStr = valueStr.replace('!p', '');
                else if (isExploded) valueStr = valueStr.replace('!', '');
                if (isCritSuccess) valueStr = valueStr.replace(/\*\*$/, '');
                if (isCritFailure) valueStr = valueStr.replace(/__/g, '');
                if (isTargetSuccess) valueStr = valueStr.replace('*', '');
                if (isRerolled) valueStr = valueStr.replace('r', '');

                const value = parseInt(valueStr, 10);
                if (isNaN(value)) return;

                const isHeads = coinFlip();
                const color = chroma.random();
                const secondaryColor = isHeads ? this.getSecondaryColorFromColor(color) : chroma.random();
                const textColor = this.getTextColorFromColors(color, secondaryColor);

                const icons = [];

                if (isDropped) icons.push("trashcan");
                if (isPenetrating) icons.push("penetrate");
                else if (isExploded) icons.push("explosion");
                if (isCritSuccess) icons.push("critical-success");
                if (isCritFailure) icons.push("critical-failure");
                if (isTargetSuccess) icons.push("target-success");
                if (isRerolled) icons.push("recycle");

                const icon = icons.length > 0 ? icons : null;
                const iconSpacing = icons.length > 0 ? 0.375 : null;

                let adjustedColor = color;
                if (isCritSuccess) {
                  adjustedColor = chroma('#ffcc00');
                } else if (isCritFailure) {
                  adjustedColor = chroma('#ff3333');
                }

                // Handle d% (percentile dice) as two dice: d% and d10
                if (diceSize === 100) {
                  groupArray.push({
                    sides: "%",
                    rolled: this.getDPercentRolled(value) as DiceFaces,
                    icon,
                    iconSpacing: 0.89,
                    color: adjustedColor,
                    secondaryColor,
                    textColor,
                    value
                  });

                  groupArray.push({
                    sides: 10,
                    rolled: this.getD10PercentRolled(value) as DiceFaces,
                    color: adjustedColor,
                    secondaryColor,
                    textColor,
                    value
                  });
                } else {
                  groupArray.push({
                    sides: diceSize,
                    rolled: value,
                    icon,
                    iconSpacing,
                    color: adjustedColor,
                    secondaryColor,
                    textColor,
                    value
                  });
                }
              });
            }
          }

          if (groupArray.length === 0) {
            const isHeads = coinFlip();
            const color = chroma.random();
            const secondaryColor = isHeads ? this.getSecondaryColorFromColor(color) : chroma.random();
            const textColor = this.getTextColorFromColors(color, secondaryColor);

            groupArray.push({
              sides: 20 as const,
              rolled: roll.total as DiceFaces,
              icon: null,
              iconSpacing: null,
              color,
              secondaryColor,
              textColor,
              value: roll.total
            });
          }
        } else {
          groupArray = roll.rolls.reduce((acc: Die[], rollGroup, outerIndex: number) => {
            if (typeof rollGroup !== "string" && typeof rollGroup !== "number") {
              const sides = rollGroupSidesMap.get(outerIndex);

              try {
                const processedGroup = this.processRollGroup(rollGroup, sides);
                acc.push(...processedGroup);
              } catch (err) {
                // Handle error silently
              }
            }
            return acc;
          }, []);
        }

        if (groupArray.length === 0) {
          const isHeads = coinFlip();
          const color = chroma.random();
          const secondaryColor = isHeads ? this.getSecondaryColorFromColor(color) : chroma.random();
          const textColor = this.getTextColorFromColors(color, secondaryColor);

          groupArray.push({
            sides: 20 as const,
            rolled: roll.total as DiceFaces,
            icon: null,
            iconSpacing: null,
            color,
            secondaryColor,
            textColor,
            value: roll.total
          });
        }

        diceArray.push([...groupArray] as Die[]);
        resultArray.push(result);
      }

      try {
        const attachment = await this.generateDiceAttachment(diceArray);
        if (attachment) {
          files = [attachment.attachment];
        }
      } catch (error) {
        console.error("Attachment generation error:", error);
      }

      if (resultArray.length === 0 && errors.length > 0) {
        return { diceArray: [], resultArray: [], errors };
      }

      return {
        diceArray,
        resultArray,
        errors: errors.length > 0 ? errors : undefined,
        files,
      };
    } catch {
      return { diceArray: [], resultArray: [], errors: ['Unexpected error occurred'] };
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
    ctx: any, // Canvas rendering context
    diceIndex: number,
    diceOuterIndex: number
  ): Promise<void> {
    if (!iconArray) return;
    
    const iconPromises = [];
    
    for (let i = 0; i < iconArray.length; i++) {
      const icon = iconArray[i];
      iconPromises.push(
        (async () => {
          try {
            const iconToLoad = await this.generateIcon(icon);
            if (!iconToLoad) return;
            
            const iconWidth = this.getIconWidth(i, diceIndex, iconSpacing);
            const iconHeight = this.getIconHeight(diceOuterIndex);
            const iconImage = await Canvas.loadImage(iconToLoad);
            
            ctx.drawImage(
              iconImage,
              iconWidth,
              iconHeight,
              this.defaultIconDimension,
              this.defaultIconDimension
            );
          } catch (error) {
            // Failed to draw this icon, but continue with others
          }
        })()
      );
    }
    
    try {
      await Promise.all(iconPromises);
    } catch (error) {
      // Continue even if some icons failed to draw
    }
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
        let toLoad = null;
        try {
          let patternFillObj;

          if (this.shouldUsePatternFill()) {
            patternFillObj = getRandomPatternFill(die.color.hex(), die.secondaryColor.hex());
          } else {
            patternFillObj = generateLinearGradientFill(die.color.hex(), die.secondaryColor.hex());
          }

          toLoad = await this.generateDie({
            sides: die.sides,
            rolled: die.rolled,
            textColor: die.textColor.hex(),
            outlineColor: "#000000",
            solidFill: die.color.hex(),
            patternFill: patternFillObj
          });

          if (!toLoad) {
            return;
          }

          try {
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
          } catch (imgErr) {
            console.error("Image loading error:", imgErr);
          }
        } catch (err) {
          console.error("Die generation error:", err);
        }
      };

      const processChunks = async (chunks: Die[][], chunkSize: number = 5) => {
        for (let i = 0; i < chunks.length; i += chunkSize) {
          const chunkGroup = chunks.slice(i, i + chunkSize);
          await Promise.all(
            chunkGroup.flatMap((array, outerIndex) => 
              array.map((die, index) => drawDice(die, index, outerIndex + i))
            )
          );
        }
      };
      
      await processChunks(paginatedArray);

      const canvasBuffer = canvas.toBuffer('image/webp');

      const processedBuffer = await sharp(canvasBuffer)
        .webp({
          lossless: false,
          quality: 85,
          smartSubsample: true
        })
        .toBuffer();

      const attachment = new AttachmentBuilder(
        processedBuffer,
        { name: "currentDice.webp" }
      );
      return { attachment, canvas };
    } catch (error) {
      return undefined;
    }
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
    sides: any;
    rolled: DiceFaces;
    textColor?: string;
    outlineColor?: string;
    solidFill?: string;
    patternFill?: PatternFillObject;
    borderWidth?: string;
    width?: string;
    height?: string;
  }): Promise<Buffer | undefined> {
    // Generate a cache key based on the dice properties
    const textColorStr = textColor || 'default';
    const outlineColorStr = outlineColor || 'default';
    const solidFillStr = solidFill || 'default';
    const patternFillName = patternFill?.name || 'default';
    
    const cacheKey = `dice_${sides}_${rolled}_${textColorStr}_${outlineColorStr}_${solidFillStr}_${patternFillName}`;
    
    // Check if we already have this dice in the cache
    if (this.diceCache.has(cacheKey)) {
      return this.diceCache.get(cacheKey);
    }
    
    if (!patternFill) {
      if (this.shouldUsePatternFill()) {
        patternFill = getRandomPatternFill(solidFill || '#ffffff', outlineColor || '#000000');
      } else {
        patternFill = generateLinearGradientFill(solidFill || '#ffffff', outlineColor || '#000000');
      }
    }

    const props = {
      result: rolled,
      sides: sides,
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

    let image = dice[sides as keyof DiceFaceData];

    if (!image) {
      image = generateGeneric(props);
    }

    try {
      const imageBuffer = Buffer.from(image);
      const needsResize = sides === 20; // Only resize d20

      let options = {
        lossless: true,
        quality: 100,
        smartSubsample: true
      };

      let attachment;
      if (needsResize) {
        attachment = await sharp(imageBuffer, { limitInputPixels: 1920 * 1080 })
          .resize({
            width: this.defaultDiceDimension,
            height: this.defaultDiceDimension,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .webp(options)
          .toBuffer();
      } else {
        attachment = await sharp(imageBuffer, { limitInputPixels: 1920 * 1080 })
          .webp(options)
          .toBuffer();
      }
      
      // Store in cache before returning
      this.diceCache.set(cacheKey, attachment);
      this.cleanupDiceCache();

      return attachment;
    } catch (err) {
      return undefined;
    }
  }

  private cleanupIconCache() {
    if (this.iconCache.size > this.MAX_ICON_CACHE_SIZE) {
      const keysToDelete = Array.from(this.iconCache.keys()).slice(0, this.iconCache.size - this.MAX_ICON_CACHE_SIZE);
      for (const key of keysToDelete) {
        this.iconCache.delete(key);
      }
    }
  }
  
  private cleanupDiceCache() {
    if (this.diceCache.size > this.MAX_DICE_CACHE_SIZE) {
      const keysToDelete = Array.from(this.diceCache.keys()).slice(0, this.diceCache.size - this.MAX_DICE_CACHE_SIZE);
      for (const key of keysToDelete) {
        this.diceCache.delete(key);
      }
    }
  }

  public async generateIcon(iconType: Icon | null): Promise<Buffer | undefined> {
    try {
      if (this.iconCache.has(iconType)) {
        return this.iconCache.get(iconType);
      }
      
      const image = this.icons.get(iconType) || this.icons.get(null);
      if (!image) return undefined;

      const imageBuffer = Buffer.from(image);
      const attachment = await sharp(imageBuffer, { limitInputPixels: 256 * 256 })
        .webp({
          lossless: true,
          quality: 100,
          smartSubsample: true
        })
        .toBuffer();
        
      this.iconCache.set(iconType, attachment);
      this.cleanupIconCache();
      
      return attachment;
    } catch (err) {
      return undefined;
    }
  }

  public async generateEmbedMessage({
    resultArray,
    attachment,
    title,
    interaction,
    source,
    username,
  }: GenerateEmbedMessageParams): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }> {
    const grandTotal = resultArray.reduce(
      (prev: number, cur: Result) => prev + cur.results,
      0
    );

    try {
      const embed = this.createEmbed(resultArray, grandTotal, attachment, title, interaction, source, username);
      return {
        embeds: [embed],
        files: attachment ? [attachment] : []
      } as { embeds: EmbedBuilder[]; files: AttachmentBuilder[] };
    } catch (error) {
      return { embeds: [], files: [] };
    }
  }

  private createEmbed(
    resultArray: Result[],
    grandTotal: number,
    attachment: AttachmentBuilder | null | undefined,
    title?: string,
    interaction?: CommandInteraction | ButtonInteraction,
    source?: string,
    username?: string
  ): EmbedBuilder {
    const diceOutput = `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""}`;

    let sourceText = '';

    if (source === 'discord') {
      const discordUsername = interaction?.user?.username;
      sourceText = discordUsername ? `sent to ${discordUsername} via discord` : 'via discord';
    } else if (source === 'web') {
      sourceText = username ? `sent to ${username} via web` : 'via web';
    }
    const embed = new EmbedBuilder()
      .setColor(tabletopColor)
      .setDescription(diceOutput)
      .setFooter({
        text: sourceText,
      });

    if (title) {
      embed.setTitle(title);
    }

    if (attachment) {
      embed.setImage('attachment://currentDice.webp');
    }

    return embed;
  }

  public generateDiceRolledMessage(diceArray: DiceArray, resultArray: number[]): string {
    const isSingleDie = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0].length === 1;

    const messages = [
      `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "clatters", "clatter")} across the table..._`,
      `_...as the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "tumbles", "tumble")}, ${pluralPick(isSingleDie, "it", "one")} continues to spin on its axis for a few seconds, as if possessed by an unknown force..._`,
      `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "bangs", "bang")} angrily across the table..._`,
      `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "clatters", "clatter")} crisply across the table..._`,
      `_...as the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "rolls", "roll")} across the gnarly surface, you think you can spot a faint light emanating from deep within ${pluralPick(isSingleDie, "it..._", "one of them..._")}`,
      `_...a sibilant wind suddenly hisses across the table as the restless ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "settles", "settle")} onto its planks..._`,
      `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "bumps", "bump")} proudly across the table's wizened grooves..._`,
      `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "dances", "dance")} and ${pluralPick(isSingleDie, "pirouettes", "pirouette")} across the table's ancient cracks..._`,
    ];

    const calculatePercentile = (total: number, min: number, max: number) => {
      return ((Number(total) - Number(min)) / (Number(max) - Number(min))) * 100;
    };

    const total = resultArray.reduce((sum, value) => sum + value, 0);

    const maxTotal = diceArray.reduce((sum, dieArray: Die | Die[]) => {
      if (Array.isArray(dieArray)) {
        return sum + dieArray.reduce((innerSum, die) => innerSum + (Number(die.sides) || 0), 0);
      } else {
        return sum + (Number(dieArray.sides) || 0);
      }
    }, 0);

    const minTotal = diceArray.reduce((sum, dieArray) => {
      if (Array.isArray(dieArray)) {
        return sum + dieArray.reduce((innerSum) => innerSum + 1, 0);
      } else {
        return sum + 1;
      }
    }, 0);

    const percentile = calculatePercentile(total, minTotal, maxTotal);

    const isSingleD4 = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0][0].sides === 4;
    const isSingleD6 = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0][0].sides === 6;

    if ((isSingleD4 && (total === 1 || total === 4)) || (isSingleD6 && total === 6)) {
      const index = getRandomNumber(messages.length - 1);
      return messages[index];
    } else if (!isSingleD4 && !isSingleD6 && (percentile >= 95 || total === maxTotal || percentile <= 15)) {
      const index = getRandomNumber(messages.length - 1);
      return messages[index];
    }
    return messages[0];
  }
}