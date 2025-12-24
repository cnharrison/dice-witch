import { DiceService } from '../core/services/DiceService';

describe('Min/Max Dice Modifiers', () => {
  let diceService: DiceService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
  });

  test('Min modifier adds chevronUp icon', async () => {
    // Use min6 to guarantee boosting since any roll 1-5 gets boosted to 6
    const result = await diceService.rollDice(['4d6min6'], [6]);

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
    // Use max1 to guarantee capping since any roll 2-6 gets capped to 1
    const result = await diceService.rollDice(['4d6max1'], [6]);

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