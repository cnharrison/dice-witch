import { coinFlip } from "../../../../shared/helpers";
import { Die, DiceFaces } from "../../../../shared/types";
import { DiceService } from "..";
import chroma from "chroma-js";

export function processRollGroup(
  this: DiceService,
  rollGroup: any,
  sides: number
): Die[] {
  if (!rollGroup || !rollGroup.rolls) {
    return [];
  }

  if (sides === undefined) {
    return rollGroup.rolls.map((currentRoll: any) => {
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
    return rollGroup.rolls.reduce((acc: Die[], cur: any) => {
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
    return rollGroup.rolls.map((currentRoll: any) => {
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