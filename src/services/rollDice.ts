import chroma from "chroma-js";
import { DiceRoll, Parser } from "rpg-dice-roller";
import { StandardDice } from "rpg-dice-roller/types/dice";
import { RollResult } from "rpg-dice-roller/types/results";
import {
  ICON_SPACING_DOUBLE,
  ICON_SPACING_SINGLE,
  ICON_SPACING_TRIPLE,
  IconType,
  modifierToIconMap,
} from "../constants";
import { coinFlip } from "../helpers";
import {
  DiceArray,
  DiceFaces,
  DiceTypesToDisplay,
  Die,
  Icon,
  Result,
  DiceTypes,
} from "../types";

const getSecondaryColorFromColor = (color: chroma.Color) => {
  const isDiceColorDark = color.get("lab.l") > 65;
  return isDiceColorDark ? color.brighten(2) : color.darken(2);
};

const getTextColorFromColors = (
  color: chroma.Color,
  secondaryColor: chroma.Color
) =>
  color.get("lab.l") + secondaryColor.get("lab.l") / 2 < 65
    ? chroma("#FAF9F6")
    : chroma("#000000");

const generateIconArray = (modifierSet: Set<string>): Icon[] | null => {
  if (modifierSet.size === 0) return null;
  return [...modifierSet].map((item) => modifierToIconMap.get(item) || IconType.BLANK);
};

const getIconSpacing = (iconArray: Icon[] | null) => {
  if (!iconArray) return null;
  switch (iconArray.length) {
    case 1:
      return ICON_SPACING_SINGLE;
    case 2:
      return ICON_SPACING_DOUBLE;
    case 3:
      return ICON_SPACING_TRIPLE;
    default:
      return null;
  }
};

const getDPercentRolled = (rolled: number): number =>
  rolled === 100 ? 0 : Math.floor(rolled / 10) * 10;
const getD10PercentRolled = (rolled: number): number =>
  rolled % 10 === 0 ? 10 : rolled % 10;

const repeatArgs = (args: string[], timesToRepeat?: number): string[] => {
  if (timesToRepeat) {
    return new Array(timesToRepeat).fill(args).flat();
  }

  return [...args];
};

// Generates a Die object with the given rolled value, sides, and modifiers.
// Also determines the color, secondary color, text color, icon, and icon spacing for the die.
const generateDie = (rolledValue: number, sides: number | string, modifiers: Set<string>): Die => {
  const isHeads = coinFlip();
  const color = chroma.random();
  const secondaryColor = isHeads ? getSecondaryColorFromColor(color) : chroma.random();
  const textColor = getTextColorFromColors(color, secondaryColor);
  const icon = generateIconArray(modifiers);
  const iconSpacing = getIconSpacing(icon);

  return {
    sides: sides as DiceTypes,
    rolled: rolledValue as DiceFaces,
    icon,
    iconSpacing,
    color,
    secondaryColor,
    textColor,
  };
};

const processRollGroup = (
  rollGroup: any,
  sidesArray: number[],
  outerIndex: number,
  availableDice: DiceTypesToDisplay[]
): Die[] => {
  const sides = sidesArray[outerIndex];
  if (sides === 100) {
    // Special handling for d100, which are actually two dice 
    return rollGroup.rolls.reduce((acc: Die[], cur: RollResult) => {
      acc.push(
        generateDie(getDPercentRolled(cur.initialValue) as DiceFaces, "%", cur.modifiers),
        generateDie(getD10PercentRolled(cur.initialValue) as DiceFaces, 10, cur.modifiers)
      );
      return acc;
    }, []);
  } else {
    // Handling for non-d100 
    return rollGroup.rolls.map((currentRoll: RollResult) =>
      generateDie(currentRoll.initialValue, sides, currentRoll.modifiers)
    );
  }
};

const rollDice = (
  args: string[],
  availableDice: DiceTypesToDisplay[],
  timesToRepeat?: number
): {
  diceArray: DiceArray;
  resultArray: Result[];
    allDiceShouldHaveImage?: boolean;
} => {
  let diceArray: DiceArray = [];
  let diceShouldHaveImageFlags: boolean[] = [];
  let resultArray: Result[] = [];
  const lowerCaseArgs = args.map((arg) => arg.toLowerCase());
  const argsToMutate = repeatArgs(lowerCaseArgs, timesToRepeat);

  try {
    argsToMutate.forEach((value) => {
      let parsedRoll: StandardDice[];

      try {
        // Parse the dice roll expression
        parsedRoll = Parser.parse(value) as StandardDice[];
      } catch (err) {
        console.error(err);
        return;
      }

      // Extract the sides of the dice from the parsed roll
      const sidesArray: number[] = parsedRoll.reduce((acc: number[], rollGroup: StandardDice) => {
          if (typeof rollGroup === "object") {
            acc.push(rollGroup.sides);
          }
          return acc;
      }, []);

        // Roll the dice
        const roll = new DiceRoll(value);
        const result: Result = {
          output: roll.output,
          results: roll.total,
        };

        // Process each roll group and accumulate the results
        const groupArray = roll.rolls.reduce((acc: Die[], rollGroup, outerIndex: number) => {
          if (typeof rollGroup !== "string" && typeof rollGroup !== "number") {
            acc.push(...processRollGroup(rollGroup, sidesArray, outerIndex, availableDice));
          }
          return acc;
        }, []);

        diceArray.push([...groupArray]);
        resultArray.push(result);

      // Determine if the dice should have an image based on available dice types
      diceShouldHaveImageFlags.push(sidesArray.every((sides: number) =>
        availableDice.includes(sides as DiceTypesToDisplay)
      ));
      }
    );

    // Determine if all dice should have an image
    const allDiceShouldHaveImage = diceShouldHaveImageFlags.every(
      (value: boolean) => value
    );

    return {
      diceArray,
      resultArray,
      allDiceShouldHaveImage,
    };
  } catch (err) {
    console.error(err);
    return { diceArray: [], resultArray: [] };
  }
};

export default rollDice;