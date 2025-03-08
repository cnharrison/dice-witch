import { DiceRoll } from "@dice-roller/rpg-dice-roller";

describe('Dice Roll Output Analysis', () => {
  test('Check min modifier flag in output', () => {
    const roll = new DiceRoll('4d6min3');
    const output = roll.output;
    console.log('Min roll output:', output);
    
    // Check if the output contains '^' which indicates a min modifier
    expect(output.includes('^')).toBe(true);
  });
  
  test('Check max modifier flag in output', () => {
    const roll = new DiceRoll('4d6max4');
    const output = roll.output;
    console.log('Max roll output:', output);
    
    // Check if the output contains 'v' which indicates a max modifier
    expect(output.includes('v')).toBe(true);
  });
});