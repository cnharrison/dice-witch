import { DiceRoll } from "@dice-roller/rpg-dice-roller";

describe('Dice Roll Output Analysis', () => {
  test('Check min modifier flag in output', () => {
    const roll = new DiceRoll('4d6min6');
    const output = roll.output;
    console.log('Min roll output:', output);

    // Check if the output contains '^' which indicates a min modifier
    // Using min6 guarantees boosting since any roll 1-5 gets boosted to 6
    expect(output.includes('^')).toBe(true);
  });
  
  test('Check max modifier flag in output', () => {
    const roll = new DiceRoll('4d6max1');
    const output = roll.output;
    console.log('Max roll output:', output);

    // Check if the output contains 'v' which indicates a max modifier
    // Using max1 guarantees capping since any roll 2-6 gets capped to 1
    expect(output.includes('v')).toBe(true);
  });
});