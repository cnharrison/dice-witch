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
      setIsValid(true);
      setTotal(null);
      setDiceInfo(null);
      return;
    }

    try {
      const roll = new DiceRoll(debouncedInput);
      setTotal(roll.total);
      setIsValid(true);

      const diceMatches = debouncedInput.match(/(\d+)?d(\d+)/g) || [];
      const diceGroups = diceMatches.map(match => {
        const [full, numDice = '1', dSize] = match.match(/(\d+)?d(\d+)/) || [];
        return {
          numberOfDice: parseInt(numDice || '1'),
          diceSize: parseInt(dSize)
        };
      });

      const modMatch = debouncedInput.match(/([+-]\d+)$/);
      const modifier = modMatch ? parseInt(modMatch[1]) : 0;

      const newDiceInfo = {
        diceGroups,
        modifier
      };

      setDiceInfo(newDiceInfo);
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