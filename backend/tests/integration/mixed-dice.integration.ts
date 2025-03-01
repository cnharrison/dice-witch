import { 
  DiceServiceMock as DiceService,
  RollServiceMock as RollService 
} from '../mocks/serviceMocks';

describe('Mixed Dice Integration Tests', () => {
  let diceService: DiceService;
  let rollService: RollService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
    rollService = RollService.getInstance();
  });

  test('mixed dice rolls with standard and non-standard dice', async () => {
    const result = await diceService.rollDice(['2d9+3d6'], [4, 6, 8, 10, 12, 20, 100]);
    
    expect(result.files).toBeDefined();
  });

  test('complex mixed dice rolls with multiple expressions', async () => {
    const result = await rollService.rollDice({
      notation: ['1d9', '2d6', '1d7+1d20'],
      source: 'discord'
    });
    
    expect(result.files).toBeDefined();
  });

  test('mixed dice roll from web interface should include base64image', async () => {
    const result = await rollService.rollDice({
      notation: '3d9+2d6',
      source: 'web',
      username: 'test-user',
      channelId: 'test-channel'
    });
    
    expect(result.base64Image).toBeDefined();
    expect(result.message).toContain('Message sent to Discord channel');
  });
});