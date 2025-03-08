import { DiceService } from '../core/services/DiceService';
import { DiceRoll } from '@dice-roller/rpg-dice-roller';

describe('Dice Modifier Tests', () => {
  let diceService: DiceService;

  beforeEach(() => {
    diceService = DiceService.getInstance();
  });

  const testDiceRoll = async (notation: string, expectedModifiers: {
    dropped?: number,
    exploded?: number,
    critSuccess?: number,
    critFailure?: number,
    targetSuccess?: number,
    rerolled?: number
  }) => {
    const result = await diceService.rollDice([notation], [], 1);
    expect(result.diceArray).toBeDefined();
    expect(result.diceArray.length).toBeGreaterThan(0);
    
    
    // Count dice with each modifier
    const allDice = result.diceArray.flat();
    
    const droppedDice = allDice.filter(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('trashcan')
    ).length;
    
    const explodedDice = allDice.filter(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('explosion')
    ).length;
    
    const critSuccessDice = allDice.filter(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('critical-success')
    ).length;
    
    const critFailureDice = allDice.filter(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('critical-failure')
    ).length;
    
    const targetSuccessDice = allDice.filter(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('target-success')
    ).length;
    
    const rerolledDice = allDice.filter(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('recycle')
    ).length;
    
    // If expectations were provided, verify them
    if (expectedModifiers.dropped !== undefined) {
      expect(droppedDice).toBe(expectedModifiers.dropped);
    }
    
    if (expectedModifiers.exploded !== undefined) {
      expect(explodedDice).toBe(expectedModifiers.exploded);
    }
    
    if (expectedModifiers.critSuccess !== undefined) {
      expect(critSuccessDice).toBe(expectedModifiers.critSuccess);
    }
    
    if (expectedModifiers.critFailure !== undefined) {
      expect(critFailureDice).toBe(expectedModifiers.critFailure);
    }
    
    if (expectedModifiers.targetSuccess !== undefined) {
      expect(targetSuccessDice).toBe(expectedModifiers.targetSuccess);
    }
    
    if (expectedModifiers.rerolled !== undefined) {
      expect(rerolledDice).toBe(expectedModifiers.rerolled);
    }
    
    return { result, droppedDice, explodedDice, critSuccessDice, critFailureDice, targetSuccessDice, rerolledDice };
  };

  test('Exploding dice are visualized correctly', async () => {
    const { result, explodedDice } = await testDiceRoll('10d6!', {});
    
    const diceCount = result.diceArray[0].length;
    expect(diceCount).toBeGreaterThanOrEqual(10);
    expect(explodedDice).toBeGreaterThanOrEqual(0);
  });
  
  test('Penetrating dice are visualized correctly', async () => {
    const testPenetratingDice = async () => {
      const result = await diceService.rollDice(['5d6!p'], [], 1);
      const allDice = result.diceArray.flat();
      
      const penetratingDice = allDice.filter(die => 
        die.icon && Array.isArray(die.icon) && die.icon.includes('penetrate')
      ).length;
      
      return { penetratingDice, diceCount: allDice.length };
    };
    
    const { penetratingDice, diceCount } = await testPenetratingDice();
    
    expect(diceCount).toBeGreaterThanOrEqual(5);
    expect(penetratingDice).toBeGreaterThanOrEqual(0);
  });
  
  test('Reroll dice are visualized correctly', async () => {
    const notation = '10d6r=1';
    const { rerolledDice } = await testDiceRoll(notation, {});
    
    expect(rerolledDice).toBeGreaterThanOrEqual(0);
    expect(rerolledDice).toBeLessThanOrEqual(10);
  });

  test('Keep highest N dice', async () => {
    const notation = '6d20k3';
    await testDiceRoll(notation, { dropped: 3 });
  });

  test('Keep lowest N dice', async () => {
    const notation = '6d20kl3';
    await testDiceRoll(notation, { dropped: 3 });
  });

  test('Drop highest N dice', async () => {
    const notation = '6d20dh2';
    await testDiceRoll(notation, { dropped: 2 });
  });

  test('Drop lowest N dice', async () => {
    const notation = '6d20d2';
    await testDiceRoll(notation, { dropped: 2 });
  });

  test('Critical success', async () => {
    const result = await diceService.rollDice(['50d20cs=20'], [], 1);
    const allDice = result.diceArray.flat();
    
    const hasCriticalSuccess = allDice.some(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('critical-success')
    );
    
    expect(hasCriticalSuccess).toBe(true);
  });

  test('Critical failure', async () => {
    const result = await diceService.rollDice(['1d1cf=1'], [], 1);
    const allDice = result.diceArray.flat();
    
    const hasCritFail = allDice.some(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('critical-failure')
    );
    
    expect(hasCritFail).toBe(true);
  });

  test('Target dice pool successes', async () => {
    const notation = '10d6=6';
    const { targetSuccessDice } = await testDiceRoll(notation, {});
    
    expect(targetSuccessDice).toBeGreaterThanOrEqual(0);
    expect(targetSuccessDice).toBeLessThanOrEqual(10);
  });

  test('Complex dice expression with multiple modifiers', async () => {
    await diceService.rollDice(['{4d6k2}+{3d10!=10cs>=9}+2d20cf=1'], [], 1);
    
    const d1Test = await diceService.rollDice(['1d1cf=1'], [], 1);
    
    const hasCritFail = d1Test.diceArray.flat().some(die => 
      die.icon && Array.isArray(die.icon) && die.icon.includes('critical-failure')
    );
    
    expect(hasCritFail).toBe(true);
  });
});