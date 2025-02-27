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

      const diceMatches = debouncedInput.match(/(\d+)?d(\d+)/g) || [];
      
      const diceGroups = diceMatches.map(match => {
        const parts = match.match(/(\d+)?d(\d+)/);
        
        const numDice = parts?.[1] || '1';
        const dSize = parts?.[2];
        
        return {
          numberOfDice: parseInt(numDice),
          diceSize: parseInt(dSize)
        };
      });

      const isValidDice = diceMatches.length > 0 && 
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