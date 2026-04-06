import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import rollCommand from '../../discord/commands/roll';
import { CommandInteraction } from 'discord.js';
import { RollServiceMock, DiceServiceMock } from '../mocks/serviceMocks';

jest.mock('../../core/services/RollService', () => ({
  RollService: {
    getInstance: () => RollServiceMock.getInstance()
  }
}));

jest.mock('../../core/services/DiceService', () => ({
  DiceService: {
    getInstance: () => DiceServiceMock.getInstance()
  }
}));

jest.mock('../../core/services/DiscordService', () => {
  const mockCheckForAttachPermission = jest.fn().mockReturnValue(true);
  mockCheckForAttachPermission.mock = { calls: [] };
  
  const mockSendMessage = jest.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-message-id'
  });
  mockSendMessage.mock = { calls: [] };
  
  const mockGetInstance = jest.fn().mockReturnValue({
    checkForAttachPermission: mockCheckForAttachPermission,
    sendMessage: mockSendMessage
  });
  mockGetInstance.mock = { calls: [] };
  
  return {
    DiscordService: {
      getInstance: mockGetInstance
    }
  };
});

jest.mock('../../discord/messages', () => {
  const mockSendHelperMessage = jest.fn().mockResolvedValue(undefined);
  mockSendHelperMessage.mock = { calls: [] };
  
  const mockSendDiceOverMaxMessage = jest.fn().mockResolvedValue(undefined);
  mockSendDiceOverMaxMessage.mock = { calls: [] };
  
  const mockSendDiceRolledMessage = jest.fn().mockResolvedValue(undefined);
  mockSendDiceRolledMessage.mock = { calls: [] };
  
  const mockSendDiceResultMessageWithImage = jest.fn().mockResolvedValue(undefined);
  mockSendDiceResultMessageWithImage.mock = { calls: [] };
  
  const mockSendNeedPermissionMessage = jest.fn().mockResolvedValue(undefined);
  mockSendNeedPermissionMessage.mock = { calls: [] };
  
  return {
    sendHelperMessage: mockSendHelperMessage,
    sendDiceOverMaxMessage: mockSendDiceOverMaxMessage,
    sendDiceRolledMessage: mockSendDiceRolledMessage,
    sendDiceResultMessageWithImage: mockSendDiceResultMessageWithImage,
    sendNeedPermissionMessage: mockSendNeedPermissionMessage
  };
});

import {
  sendHelperMessage,
  sendDiceOverMaxMessage,
  sendDiceRolledMessage,
  sendDiceResultMessageWithImage
} from '../../discord/messages';

const createMockInteraction = () => {
  const mockDeferReply = jest.fn().mockResolvedValue(undefined);
  mockDeferReply.mock = { calls: [] };
  
  const mockEditReply = jest.fn().mockResolvedValue(undefined);
  mockEditReply.mock = { calls: [] };

  const mockFollowUp = jest.fn().mockResolvedValue(undefined);
  mockFollowUp.mock = { calls: [] };

  const mockReply = jest.fn().mockResolvedValue(undefined);
  mockReply.mock = { calls: [] };
  
  const mockIsRepliable = jest.fn().mockReturnValue(true);
  mockIsRepliable.mock = { calls: [] };
  
  return {
    deferReply: mockDeferReply,
    editReply: mockEditReply,
    followUp: mockFollowUp,
    reply: mockReply,
    deferred: false,
    replied: false,
    isRepliable: mockIsRepliable
  } as unknown as CommandInteraction;
};

describe('Roll Command Integration Tests', () => {
  let mockInteraction: CommandInteraction;
  let rollService: RollServiceMock;

  beforeEach(() => {
    mockInteraction = createMockInteraction();
    rollService = RollServiceMock.getInstance();

    jest.clearAllMocks();

    rollService.checkDiceLimits = jest.fn().mockReturnValue({
      isOverMax: false,
      containsDice: true
    });

    rollService.rollDice = jest.fn().mockResolvedValue({
      diceArray: [
        [
          { sides: 20, rolled: 15, value: 15 }
        ]
      ],
      resultArray: [
        { output: '1d20: 15', results: 15 }
      ]
    });
  });

  test('should send help message when no arguments provided', async () => {
    const mockClient = {} as any;
    await rollCommand.execute({
      args: [],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(sendHelperMessage).toHaveBeenCalledWith({ interaction: mockInteraction });
    expect(rollService.rollDice).not.toHaveBeenCalled();
  });

  test('should send help message when invalid notation (plain number) provided', async () => {
    rollService.checkDiceLimits = jest.fn().mockReturnValue({
      isOverMax: false,
      containsDice: false
    });

    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['8000'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(sendHelperMessage).toHaveBeenCalledWith({ interaction: mockInteraction });
    expect(rollService.rollDice).not.toHaveBeenCalled();
  });

  test('should send help message when invalid notation (text) provided', async () => {
    rollService.checkDiceLimits = jest.fn().mockReturnValue({
      isOverMax: false,
      containsDice: false
    });

    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['heyheyhey'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(sendHelperMessage).toHaveBeenCalledWith({ interaction: mockInteraction });
    expect(rollService.rollDice).not.toHaveBeenCalled();
  });

  test('should send dice over max message when dice limit exceeded', async () => {
    rollService.checkDiceLimits = jest.fn().mockReturnValue({
      isOverMax: true,
      containsDice: true
    });

    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['100d100'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(sendDiceOverMaxMessage).toHaveBeenCalledWith({
      args: ['100d100'],
      interaction: mockInteraction
    });
    expect(rollService.rollDice).not.toHaveBeenCalled();
  });

  test('should treat unsafe exploding notation as over max and stop before rolling', async () => {
    rollService.checkDiceLimits = jest.fn().mockReturnValue({
      isOverMax: true,
      containsDice: true,
      unsafeNotationReason: 'Expected exploded dice count exceeds the 50 dice image limit.'
    });

    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['d100!>0'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(sendDiceOverMaxMessage).toHaveBeenCalledWith({
      args: ['d100!>0'],
      interaction: mockInteraction
    });
    expect(rollService.rollDice).not.toHaveBeenCalled();
  });

  test('should send over max message if roll result exceeds image limit after processing', async () => {
    rollService.rollDice = jest.fn().mockResolvedValue({
      diceArray: [],
      resultArray: [],
      errors: ['DICE_OVER_MAX']
    });

    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['1d20'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(sendDiceOverMaxMessage).toHaveBeenCalledWith({
      args: ['1d20'],
      interaction: mockInteraction
    });
    expect(sendDiceRolledMessage).not.toHaveBeenCalled();
    expect(sendDiceResultMessageWithImage).not.toHaveBeenCalled();
  });

  test('should roll dice and send messages for valid notation', async () => {
    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['1d20'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(rollService.rollDice).toHaveBeenCalledWith({
      notation: ['1d20'],
      timesToRepeat: undefined,
      title: undefined,
      interaction: mockInteraction,
      source: 'discord'
    });
    expect(sendDiceRolledMessage).toHaveBeenCalled();
    expect(sendDiceResultMessageWithImage).toHaveBeenCalled();
  });

  test('should process dice rolls with timesToRepeat parameter', async () => {
    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['1d20'],
      timesToRepeat: 3,
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(rollService.checkDiceLimits).toHaveBeenCalledWith(['1d20'], 3);
    expect(rollService.rollDice).toHaveBeenCalledWith({
      notation: ['1d20'],
      timesToRepeat: 3,
      title: undefined,
      interaction: mockInteraction,
      source: 'discord'
    });
  });

  test('should process dice rolls with title parameter', async () => {
    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['1d20'],
      title: 'Attack Roll',
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(rollService.rollDice).toHaveBeenCalledWith({
      notation: ['1d20'],
      timesToRepeat: undefined,
      title: 'Attack Roll',
      interaction: mockInteraction,
      source: 'discord'
    });
    expect(sendDiceResultMessageWithImage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Attack Roll' })
    );
  });

  test('should handle no results from dice roll', async () => {
    rollService.rollDice = jest.fn().mockResolvedValue({
      diceArray: [],
      resultArray: []
    });

    const mockClient = {} as any;
    await rollCommand.execute({
      args: ['1d20'],
      interaction: mockInteraction,
      discord: mockClient
    });

    expect(sendHelperMessage).toHaveBeenCalled();
    expect(sendDiceRolledMessage).not.toHaveBeenCalled();
    expect(sendDiceResultMessageWithImage).not.toHaveBeenCalled();
  });
});