import { AttachmentBuilder } from "discord.js";
import { DiceRoll, Parser } from "@dice-roller/rpg-dice-roller";
import chroma from "chroma-js";
import { DiceArray, DiceFaces, DiceTypesToDisplay, Die, Result } from "../../../../shared/types";
import { coinFlip } from "../../../../shared/helpers";
import { DiceService } from "..";

export async function rollDice(
  this: DiceService,
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
              const isMinValue = dieValueStr.includes('^');
              const isMaxValue = dieValueStr.includes('v');
              const isUnique = dieValueStr.includes('u');

              let valueStr = dieValueStr;
              if (isDropped) valueStr = valueStr.slice(0, -1);
              if (isPenetrating) valueStr = valueStr.replace(/!p/g, '');
              else if (isExploded) valueStr = valueStr.replace(/!/g, '');
              if (isCritSuccess) valueStr = valueStr.replace(/\*\*$/, '');
              if (isCritFailure) valueStr = valueStr.replace(/__/g, '');
              if (isTargetSuccess) valueStr = valueStr.replace(/\*/g, '');
              if (isRerolled) valueStr = valueStr.replace(/r/g, '');
              if (isMinValue) valueStr = valueStr.replace(/\^/g, '');
              if (isMaxValue) valueStr = valueStr.replace(/v/g, '');
              if (isUnique) valueStr = valueStr.replace(/u/g, '');

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
              if (isMinValue) {
                icons.push("chevronUp");
              }
              if (isMaxValue) {
                icons.push("chevronDown");
              }
              if (isUnique) {
                icons.push("unique");
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
              const isUnique = dieValue.includes('u');
              const isMinValue = dieValue.includes('^');
              const isMaxValue = dieValue.includes('v');

              let valueStr = dieValue;
              if (isDropped) valueStr = valueStr.slice(0, -1);
              if (isPenetrating) valueStr = valueStr.replace('!p', '');
              else if (isExploded) valueStr = valueStr.replace('!', '');
              if (isCritSuccess) valueStr = valueStr.replace(/\*\*$/, '');
              if (isCritFailure) valueStr = valueStr.replace(/__/g, '');
              if (isTargetSuccess) valueStr = valueStr.replace('*', '');
              if (isRerolled) valueStr = valueStr.replace('r', '');
              if (isUnique) valueStr = valueStr.replace('u', '');
              if (isMinValue) valueStr = valueStr.replace('^', '');
              if (isMaxValue) valueStr = valueStr.replace('v', '');

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
              if (isMinValue) icons.push("chevronUp");
              if (isMaxValue) icons.push("chevronDown");
              if (isUnique) icons.push("unique");

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