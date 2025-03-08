import { DiceService } from '../core/services/DiceService';

describe('Min/Max Dice Modifiers', () => {
  let diceService: DiceService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
  });

  test('Min modifier adds chevronUp icon', async () => {
    const result = await diceService.rollDice(['4d6min3'], [6]);
    
    // Check if any dice have the chevronUp icon
    const hasMinIcon = result.diceArray.some(group => 
      group.some(die => 
        die.icon && 
        Array.isArray(die.icon) && 
        die.icon.includes('chevronUp')
      )
    );
    
    expect(hasMinIcon).toBe(true);
  });

  test('Max modifier adds chevronDown icon', async () => {
    const result = await diceService.rollDice(['4d6max4'], [6]);
    
    // Check if any dice have the chevronDown icon
    const hasMaxIcon = result.diceArray.some(group => 
      group.some(die => 
        die.icon && 
        Array.isArray(die.icon) && 
        die.icon.includes('chevronDown')
      )
    );
    
    expect(hasMaxIcon).toBe(true);
  });
});