import { 
  DiceServiceMock as DiceService, 
  RollServiceMock as RollService 
} from '../mocks/serviceMocks';

describe('Simple Integration Tests', () => {
  let diceService: DiceService;
  let rollService: RollService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
    rollService = RollService.getInstance();
  });

  test('should roll dice', async () => {
    const result = await diceService.rollDice(['2d6'], [4, 6, 8, 10, 12, 20]);
    expect(result).toBeDefined();
    expect(result.diceArray).toBeDefined();
    expect(result.resultArray).toBeDefined();
  });

  test('should determine dice limits', () => {
    const result = rollService.checkDiceLimits('5d6');
    expect(result.isOverMax).toBe(false);
  });

  test('should generate dice rolled message', () => {
    const message = diceService.generateDiceRolledMessage([], []);
    expect(message).toContain('dice clatter');
  });
});