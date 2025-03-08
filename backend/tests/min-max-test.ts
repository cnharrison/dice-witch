import { DiceRoll } from "@dice-roller/rpg-dice-roller";

// Test min/max dice modifiers
const testMinMax = () => {
  console.log('Testing min/max dice modifiers:');
  
  // Test min modifier
  const minRoll = new DiceRoll('4d6min3');
  console.log('min Roll:');
  console.log('Output:', minRoll.output);
  console.log('Notation:', minRoll.notation);
  console.log('Rolls:', JSON.stringify(minRoll.rolls, null, 2));
  console.log('Total:', minRoll.total);
  console.log('---------------------');

  // Test max modifier
  const maxRoll = new DiceRoll('4d6max4');
  console.log('max Roll:');
  console.log('Output:', maxRoll.output);
  console.log('Notation:', maxRoll.notation);
  console.log('Rolls:', JSON.stringify(maxRoll.rolls, null, 2));
  console.log('Total:', maxRoll.total);
  console.log('---------------------');
};

testMinMax();