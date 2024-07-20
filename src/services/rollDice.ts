import chroma from "chroma-js";
import { StandardDice } from "rpg-dice-roller/types/dice";
import { RollResult } from "rpg-dice-roller/types/results";
import { DiceRoll, Parser } from "rpg-dice-roller";
import {
  Icon,
  Result,
  Die,
  DiceTypesToDisplay,
  DiceFaces,
  DiceArray,
} from "../types";
import { coinFlip } from "../helpers";

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
  return [...modifierSet].map((item) => {
    switch (item) {
      case "drop":
        return "trashcan";
      case "explode":
        return "explosion";
      case "re-roll":
        return "recycle";
      case "max":
        return "chevronDown";
      case "min":
        return "chevronUp";
      case "target-success":
        return "bullseye";
      case "critical-success":
        return "crit";
      case "critical-failure":
        return "dizzyFace";
      case "penetrate":
        return "arrowThrough";
      default:
        return "blank";
    }
  });
};

const getIconSpacing = (iconArray: Icon[] | null) => {
  if (!iconArray) return null;
  switch (iconArray.length) {
    case 1:
      return 0.375;
    case 2:
      return 0.26;
    case 3:
      return 0.19;
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

const processRollGroup = (
  rollGroup: any,
  sidesArray: number[],
  outerIndex: number,
  availableDice: DiceTypesToDisplay[]
): Die[] => {
  const sides = sidesArray[outerIndex];
  if (sides === 100) {
    return rollGroup.rolls.reduce((acc: Die[], cur: RollResult) => {
      const isHeads = coinFlip();
      const color = chroma.random();
      const secondaryColor = isHeads
        ? getSecondaryColorFromColor(color)
        : chroma.random();
      const textColor = getTextColorFromColors(color, secondaryColor);
      const icon = generateIconArray(cur.modifiers);
      acc.push(
        {
          sides: "%",
          rolled: getDPercentRolled(cur.initialValue) as DiceFaces,
          icon,
          iconSpacing: 0.89,
          color,
          secondaryColor,
          textColor,
        },
        {
          sides: 10,
          rolled: getD10PercentRolled(cur.initialValue) as DiceFaces,
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
        ? getSecondaryColorFromColor(color)
        : chroma.random();
      const textColor = getTextColorFromColors(color, secondaryColor);
      const icon = generateIconArray(currentRoll.modifiers);
      const iconSpacing = getIconSpacing(icon);
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
};

const rollDice = (
  args: string[],
  availableDice: DiceTypesToDisplay[],
  timesToRepeat?: number
): {
  diceArray: DiceArray;
  resultArray: Result[];
  shouldHaveImage?: boolean;
} => {
  let diceArray: DiceArray = [];
  let shouldHaveImageArray: boolean[] = [];
  let resultArray: Result[] = [];
  const lowerCaseArgs = args.map((arg) => arg.toLowerCase());
  const argsToMutate = repeatArgs(lowerCaseArgs, timesToRepeat);

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
            acc.push(...processRollGroup(rollGroup, sidesArray, outerIndex, availableDice));
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
};

export default rollDice;