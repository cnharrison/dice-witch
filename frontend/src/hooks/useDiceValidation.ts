import { DiceRoll } from '@dice-roller/rpg-dice-roller';
import { useEffect, useState } from 'react';

interface DiceGroup {
  numberOfDice: number;
  diceSize: number;
}

export interface DiceInfo {
  diceGroups: DiceGroup[];
  modifier: number;
}

export function useDiceValidation(initialValue: string = '', debounceMs: number = 500) {
  const [input, setInput] = useState(initialValue);
  const [debouncedInput, setDebouncedInput] = useState(input);
  const [isValid, setIsValid] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [diceInfo, setDiceInfo] = useState<DiceInfo | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedInput(input);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [input, debounceMs]);

  useEffect(() => {
    if (!debouncedInput) {
      setIsValid(false);
      setTotal(null);
      setDiceInfo(null);
      return;
    }

    try {
      const roll = new DiceRoll(debouncedInput);
      setTotal(roll.total);

      let diceGroups: DiceGroup[] = [];

      if (debouncedInput.includes('{')) {
        const diceRegex = /\{(\d+)d(\d+)[^}]*\}/g;
        let match;

        while ((match = diceRegex.exec(debouncedInput)) !== null) {
          if (match[1] && match[2]) {
            const count = parseInt(match[1]);
            const size = parseInt(match[2]);

            diceGroups.push({
              numberOfDice: count,
              diceSize: size
            });
          }
        }

        if (diceGroups.length > 0) {
          const isValidDice = diceGroups.length > 0 &&
            diceGroups.every(group => group.numberOfDice > 0 && group.diceSize > 0);

          setIsValid(isValidDice);
          setDiceInfo({ diceGroups, modifier: roll.modifier || 0 });
          return;
        }
      }

      const groupMap = new Map<number, { count: number, size: number }>();

      if (roll.rolls) {
        roll.rolls.forEach((rollGroup) => {
          if (typeof rollGroup !== 'string' && typeof rollGroup !== 'number' && rollGroup.dice) {
            const sides = rollGroup.dice?.sides;

            if (sides && typeof sides === 'number' && sides > 0) {
              const count = rollGroup.dice.qty || (rollGroup.rolls?.length || 0);

              if (groupMap.has(sides)) {
                const group = groupMap.get(sides)!;
                group.count += count;
              } else {
                groupMap.set(sides, { count, size: sides });
              }
            }
          }
        });
      }

      for (const [size, data] of groupMap.entries()) {
        diceGroups.push({
          numberOfDice: data.count,
          diceSize: size
        });
      }

      if (diceGroups.length === 0) {
        const diceMatches = debouncedInput.match(/(\d+)?d(\d+)/g) || [];

        diceGroups = diceMatches.map(match => {
          const parts = match.match(/(\d+)?d(\d+)/);

          const numDice = parts?.[1] || '1';
          const dSize = parts?.[2];

          return {
            numberOfDice: parseInt(numDice),
            diceSize: parseInt(dSize)
          };
        });
      }

      const isValidDice = diceGroups.length > 0 &&
        diceGroups.every(group => group.numberOfDice > 0 && group.diceSize > 0);

      setIsValid(isValidDice);

      setDiceInfo({
        diceGroups,
        modifier: roll.modifier || 0
      });
    } catch (error) {
      setIsValid(false);
      setTotal(null);
      setDiceInfo(null);
    }
  }, [debouncedInput]);

  return {
    input,
    setInput,
    isValid,
    total,
    diceInfo
  };
}