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
      
      const diceRegex = /(\d+)d(\d+|\%)(?:k|d)?(\d+)?/gi;
      let match;
      
      while ((match = diceRegex.exec(roll.notation)) !== null) {
        const count = parseInt(match[1]);
        const size = match[2] === '%' ? 100 : parseInt(match[2]);
        if (count > 0 && size > 0) {
          diceGroups.push({
            numberOfDice: count,
            diceSize: size
          });
        }
      }
      
      if (diceGroups.length === 0 && roll.rolls) {
        const processedDice = new Set();
        
        const extractDice = (rollGroup) => {
          if (typeof rollGroup === 'string' || typeof rollGroup === 'number') {
            return;
          }
          
          if (rollGroup.dice && rollGroup.dice.sides) {
            const sides = rollGroup.dice.sides;
            const count = rollGroup.dice.qty || 0;
            
            const key = `${count}d${sides}`;
            if (count > 0 && sides > 0 && !processedDice.has(key)) {
              diceGroups.push({
                numberOfDice: count,
                diceSize: sides
              });
              processedDice.add(key);
            }
          }
          
          if (rollGroup.results) {
            rollGroup.results.forEach(subGroup => extractDice(subGroup));
          }
          
          if (rollGroup.rolls && Array.isArray(rollGroup.rolls)) {
            if (!rollGroup.dice && rollGroup.type === 'roll-results') {
              let sides = 20;
              const count = rollGroup.rolls.length;
              
              const key = `${count}d${sides}`;
              if (count > 0 && !processedDice.has(key)) {
                diceGroups.push({
                  numberOfDice: count,
                  diceSize: sides
                });
                processedDice.add(key);
              }
            }
          }
        };
        
        roll.rolls.forEach(rollGroup => extractDice(rollGroup));
      }
      
      if (diceGroups.length > 0) {
        setIsValid(true);
        setDiceInfo({ diceGroups, modifier: roll.modifier || 0 });
        return;
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
        const diceMatches = debouncedInput.match(/(\d+)?d(\d+|\%)/g) || [];

        diceGroups = diceMatches.map(match => {
          const parts = match.match(/(\d+)?d(\d+|\%)/);

          const numDice = parts?.[1] || '1';
          const dSize = parts?.[2];

          return {
            numberOfDice: parseInt(numDice),
            diceSize: dSize === '%' ? 100 : parseInt(dSize)
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