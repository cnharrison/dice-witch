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
  const isDiceColorDark = color.get("lab.l") > 65
  return isDiceColorDark
  ? color.brighten(2)
  : color.darken(2);
}

const getTextColorFromColors = (color: chroma.Color, secondaryColor: chroma.Color) => 
  color.get("lab.l") + secondaryColor.get("lab.l") / 2 < 65
  ? chroma("#FAF9F6")
  : chroma("#000000");


const generateIconArray = (modifierSet: Set<string>): Icon[] | null => {
  return modifierSet.size > 0
    ? [...modifierSet].map((item) => {
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
      })
    : null;
};

const getIconSpacing = (iconArray: Icon[] | null) => {
  switch (iconArray?.length) {
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

//TODO: break up this ginormous function
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
  let groupArray: (
    | Die[]
    | { sides: number; rolled: number; icon: Icon[] | null }[]
  )[];
  let result: Result;
  let resultArray: Result[] | [] = [];
  const lowerCaseArgs = args.map((args) => args.toLowerCase());
  let argsToMutate = lowerCaseArgs;

  try {
    if (timesToRepeat) {
      const number = timesToRepeat;
      argsToMutate = new Array(number).fill(argsToMutate).flat();
    } else {
      argsToMutate.forEach((value: string, outerIndex: number) => {
        const isMultiRollToken = value.match(/^.*?(\<[^\d]*(\d+)[^\d]*\>).*/);
        if (isMultiRollToken && !timesToRepeat) {
          const number = Number(isMultiRollToken[2]);
          argsToMutate = argsToMutate.filter(
            (_, index) => index !== outerIndex
          );
          argsToMutate = new Array(number).fill(argsToMutate).flat();
        }
      });
    }

    argsToMutate.forEach((value) => {
      let parsedRoll;

      try {
        parsedRoll = Parser.parse(value);
      } catch (err) {
        console.error(err);
      }

      const sidesArray = parsedRoll
        ? parsedRoll
            .filter((rollGroup: StandardDice) => typeof rollGroup !== "string")
            .filter((rollGroup: StandardDice) => typeof rollGroup !== "number")
            .map((roll: StandardDice) => roll.sides)
        : [];

      const shouldHaveImage = !!sidesArray.every((sides: any) =>
        availableDice.includes(sides)
      );

      if (parsedRoll) {
        const roll = new DiceRoll(value);
        result = {
          output: roll.output,
          results: roll.total,
        };
        groupArray = roll.rolls
          .filter((rollGroup: any) => typeof rollGroup !== "string")
          .filter((rollGroup: any) => typeof rollGroup !== "number")
          .map((rollGroup: any, outerIndex: number) => 
            sidesArray[outerIndex] === 100
              ? rollGroup.rolls.reduce(
                  (acc: Die[], cur: RollResult) => {
                    const isHeads = coinFlip();
                    const color = chroma.random();
                    const secondaryColor = isHeads ? getSecondaryColorFromColor(color) : chroma.random();
                    const textColor = getTextColorFromColors(color, secondaryColor);
                    const icon = generateIconArray(cur.modifiers)
                    acc.push(
                      {
                        sides: "%",
                        rolled: getDPercentRolled(
                          cur.initialValue
                        ) as DiceFaces,
                        icon,
                        iconSpacing: 2.875,
                        color,
                        secondaryColor,
                        textColor
                      },
                      {
                        sides: 10,
                        rolled: getD10PercentRolled(
                          cur.initialValue
                        ) as DiceFaces,   
                        color,
                        secondaryColor,
                        textColor
                      }
                    );
                    return acc;
                  },
                  []
                )
              : rollGroup.rolls.map((currentRoll: RollResult) => {
                const isHeads = coinFlip();
                const color = chroma.random();
                const secondaryColor = isHeads ? getSecondaryColorFromColor(color) : chroma.random()
                const textColor = getTextColorFromColors(color, secondaryColor)
                const icon = generateIconArray(currentRoll.modifiers)
                const iconSpacing = getIconSpacing(icon);
                return {
                  sides: sidesArray[outerIndex],
                  rolled: currentRoll.initialValue,
                  icon,
                  iconSpacing,
                  color,
                  secondaryColor,
                  textColor
                }
              
              }));
        diceArray = [...diceArray, ...groupArray];
        resultArray = [...resultArray, result];
        shouldHaveImageArray = [...shouldHaveImageArray, shouldHaveImage];
      }
    });

    const shouldHaveImage = !!shouldHaveImageArray.every(
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
