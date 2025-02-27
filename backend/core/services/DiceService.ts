import Canvas, { Canvas as CanvasType, Image } from "@napi-rs/canvas";
import chroma from "chroma-js";
import { AttachmentBuilder, ButtonInteraction, CommandInteraction, EmbedBuilder } from "discord.js";
import { DiceRoll, Parser, RollResult, StandardDice } from "rpg-dice-roller";
import sharp from "sharp";
import { coinFlip, getRandomNumber, pluralPick } from "../../shared/helpers";
import {
  DiceArray,
  DiceFaceData,
  DiceFaces,
  DiceTypes,
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
} from "./images/generateDice/dice";
import generateLinearGradientFill from "./images/generateDice/fills/generateLinearGradientFill";
import generateDie from "./images/generateDie";
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
  private defaultDiceDimension = 100;
  private defaultIconDimension = 25;
  private maxRowLength = 10;

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

  private processRollGroup(
    rollGroup: any,
    sides: number,
  ): Die[] {
    if (sides === undefined) {
      return rollGroup.rolls.map((currentRoll: RollResult) => {
        const isHeads = coinFlip();
        const color = chroma.random();
        const secondaryColor = isHeads
          ? this.getSecondaryColorFromColor(color)
          : chroma.random();
        const textColor = this.getTextColorFromColors(color, secondaryColor);
        return {
          sides: 6,
          rolled: currentRoll.initialValue,
          icon: null,
          iconSpacing: 0,
          color,
          secondaryColor,
          textColor,
          value: currentRoll.initialValue,
        };
      });
    }

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
            value: cur.initialValue,
          },
          {
            sides: 10,
            rolled: this.getD10PercentRolled(cur.initialValue) as DiceFaces,
            color,
            secondaryColor,
            textColor,
            value: cur.initialValue,
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
          value: currentRoll.initialValue,
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
    errors?: string[];
  } {
    let diceArray: DiceArray = [];
    let shouldHaveImageArray: boolean[] = [];
    let resultArray: Result[] = [];
    let errors: string[] = [];
    const lowerCaseArgs = args.map((arg) => arg.toLowerCase());
    const argsToMutate = this.repeatArgs(lowerCaseArgs, timesToRepeat);

    try {
      argsToMutate.forEach((value) => {
        let parsedRoll;

        try {
          parsedRoll = Parser.parse(value);
        } catch (err) {
          errors.push(`Invalid notation: ${value}`);
          return;
        }

        const rollGroupSidesMap = new Map();
        if (parsedRoll && Array.isArray(parsedRoll)) {
          parsedRoll.forEach((group, index) => {
            if (typeof group === 'object' && group.sides) {
              rollGroupSidesMap.set(index, group.sides);
            }
          });
        }
        const allSides = Array.from(rollGroupSidesMap.values());
        const shouldHaveImage = allSides.length > 0 && allSides.every(sides => 
          availableDice.includes(sides)
        );

        const roll = new DiceRoll(value);
        const result: Result = {
          output: roll.output,
          results: roll.total,
        };

        const groupArray = roll.rolls.reduce((acc: Die[], rollGroup, outerIndex: number) => {
          if (typeof rollGroup !== "string" && typeof rollGroup !== "number") {
            const sides = rollGroupSidesMap.get(outerIndex);
            const processedGroup = this.processRollGroup(rollGroup, sides);
            acc.push(...processedGroup);
          }
          return acc;
        }, []);

        diceArray.push([...groupArray]);
        resultArray.push(result);
        shouldHaveImageArray.push(shouldHaveImage);
      });

      const shouldHaveImage = shouldHaveImageArray.every(
        (value: boolean) => value
      );

      return {
        diceArray,
        resultArray,
        shouldHaveImage,
        errors: errors.length ? errors : undefined,
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
      }
    }));
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
        try {
          const toLoad = await generateDie(
            die.sides,
            die.rolled,
            die.textColor.hex(),
            "#000000",
            undefined,
            generateLinearGradientFill(die.color.hex(), die.secondaryColor.hex())
          );

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
          }
        } catch (err) {
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
    } catch {
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
      return undefined;
    }

    try {
      const attachment = await sharp(Buffer.from(image)).webp({ lossless: true, quality: 100 }).toBuffer();
      return attachment;
    } catch (err) {
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
      return { embeds: [embed], files: [attachment] };
    } catch {
      return { embeds: [], files: [] };
    }
  }

  private createEmbed(
    resultArray: Result[],
    grandTotal: number,
    attachment: AttachmentBuilder,
    title?: string,
    interaction?: CommandInteraction | ButtonInteraction,
    source?: string,
    username?: string
  ): EmbedBuilder {
    const footerText = `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""}`;
    
    let sourceText = '';
    if (interaction) {
      sourceText = `\nsent to ${interaction.user.username} via discord`;
    } else if (source === 'web') {
      sourceText = `\nsent to ${username} via web`;
    }

    const embed = new EmbedBuilder()
      .setColor(tabletopColor)
      .setImage("attachment://currentDice.png")
      .setFooter({ text: footerText + sourceText });

    if (title) {
      embed.setTitle(title);
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
        return sum + dieArray.reduce((innerSum, die) => innerSum + 1, 0);
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