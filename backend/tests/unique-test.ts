import { DiceRoll } from "@dice-roller/rpg-dice-roller";

// Test unique dice modifier
const testUnique = () => {
  console.log('Testing unique dice modifier:');
  
  // Test unique modifier (reroll all duplicates)
  const uniqueRoll = new DiceRoll('8d6u');
  console.log('Unique Roll:');
  console.log('Output:', uniqueRoll.output);
  console.log('Notation:', uniqueRoll.notation);
  console.log('Rolls:', JSON.stringify(uniqueRoll.rolls, null, 2));
  console.log('Total:', uniqueRoll.total);
  console.log('---------------------');
  
  // Test unique with comparison (only reroll duplicates equal to 5)
  const uniqueCompareRoll = new DiceRoll('8d6u=5');
  console.log('Unique with comparison Roll:');
  console.log('Output:', uniqueCompareRoll.output);
  console.log('Notation:', uniqueCompareRoll.notation);
  console.log('Rolls:', JSON.stringify(uniqueCompareRoll.rolls, null, 2));
  console.log('Total:', uniqueCompareRoll.total);
  console.log('---------------------');
  
  // Test unique with comparison (only reroll duplicates greater than 3)
  const uniqueGreaterRoll = new DiceRoll('8d6u>3');
  console.log('Unique with greater than comparison Roll:');
  console.log('Output:', uniqueGreaterRoll.output);
  console.log('Notation:', uniqueGreaterRoll.notation);
  console.log('Rolls:', JSON.stringify(uniqueGreaterRoll.rolls, null, 2));
  console.log('Total:', uniqueGreaterRoll.total);
  console.log('---------------------');
};

testUnique();