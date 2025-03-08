import { DiceService } from '../core/services/DiceService';

describe('Unique Dice Modifier Test', () => {
  let diceService: DiceService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
  });

  test('Unique modifier adds snowflake icon', async () => {
    // Try multiple times since dice rolls are random
    for (let i = 0; i < 5; i++) {
      const result = await diceService.rollDice(['8d6u'], [6]);
      
      // Check if any dice have the unique (snowflake) icon
      const hasUniqueIcon = result.diceArray.some(group => 
        group.some(die => 
          die.icon && 
          Array.isArray(die.icon) && 
          die.icon.includes('unique')
        )
      );
      
      // If we find an icon, test passes
      if (hasUniqueIcon) {
        expect(hasUniqueIcon).toBe(true);
        return;
      }
    }
    
    // If we get here, none of the attempts showed the icon
    fail('No unique icon found in multiple attempts');
  });

  test('Unique with comparison adds snowflake icon', async () => {
    // Try multiple times since dice rolls are random
    for (let i = 0; i < 5; i++) {
      const result = await diceService.rollDice(['8d6u=5'], [6]);
      
      // Log some debug info
      console.log(`Test run ${i+1} - Dice array:`, result.diceArray[0].map(die => ({
        value: die.value,
        icon: die.icon
      })));
      
      // Check if any dice have the unique (snowflake) icon
      const hasUniqueIcon = result.diceArray.some(group => 
        group.some(die => 
          die.icon && 
          Array.isArray(die.icon) && 
          die.icon.includes('unique')
        )
      );
      
      // If we find an icon, test passes
      if (hasUniqueIcon) {
        expect(hasUniqueIcon).toBe(true);
        return;
      }
    }
    
    // If we get here, none of the attempts showed the icon
    fail('No unique icon found in multiple attempts');
  });
});