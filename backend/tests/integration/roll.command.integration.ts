import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import rollCommand from '../../discord/commands/roll';
import { CommandInteraction } from 'discord.js';
import { RollServiceMock, DiceServiceMock } from '../mocks/serviceMocks';

// Mock services
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

jest.mock('../../core/services/DiscordService', () => ({
  DiscordService: {
    getInstance: jest.fn().mockReturnValue({
      checkForAttachPermission: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'mock-message-id'
      })
    })
  }
}));

jest.mock('../../discord/messages', () => ({
  sendHelperMessage: jest.fn().mockResolvedValue(undefined),
  sendDiceOverMaxMessage: jest.fn().mockResolvedValue(undefined),
  sendDiceRolledMessage: jest.fn().mockResolvedValue(undefined),
  sendDiceResultMessageWithImage: jest.fn().mockResolvedValue(undefined),
  sendNeedPermissionMessage: jest.fn().mockResolvedValue(undefined)
}));

import {
  sendHelperMessage,
  sendDiceOverMaxMessage,
  sendDiceRolledMessage,
  sendDiceResultMessageWithImage
} from '../../discord/messages';

const createMockInteraction = () => {
  return {
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferred: false,
    replied: false,
    isRepliable: jest.fn().mockReturnValue(true)
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
    await rollCommand.execute({
      args: [],
      interaction: mockInteraction
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

    await rollCommand.execute({
      args: ['8000'],
      interaction: mockInteraction
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

    await rollCommand.execute({
      args: ['heyheyhey'],
      interaction: mockInteraction
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

    await rollCommand.execute({
      args: ['100d100'],
      interaction: mockInteraction
    });

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(sendDiceOverMaxMessage).toHaveBeenCalledWith({
      args: ['100d100'],
      interaction: mockInteraction
    });
    expect(rollService.rollDice).not.toHaveBeenCalled();
  });

  test('should roll dice and send messages for valid notation', async () => {
    await rollCommand.execute({
      args: ['1d20'],
      interaction: mockInteraction
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
    await rollCommand.execute({
      args: ['1d20'],
      timesToRepeat: 3,
      interaction: mockInteraction
    });

    expect(rollService.rollDice).toHaveBeenCalledWith({
      notation: ['1d20'],
      timesToRepeat: 3,
      title: undefined,
      interaction: mockInteraction,
      source: 'discord'
    });
  });

  test('should process dice rolls with title parameter', async () => {
    await rollCommand.execute({
      args: ['1d20'],
      title: 'Attack Roll',
      interaction: mockInteraction
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
    // Mock empty results
    rollService.rollDice = jest.fn().mockResolvedValue({
      diceArray: [],
      resultArray: []
    });

    await rollCommand.execute({
      args: ['1d20'],
      interaction: mockInteraction
    });

    expect(sendHelperMessage).toHaveBeenCalled();
    expect(sendDiceRolledMessage).not.toHaveBeenCalled();
    expect(sendDiceResultMessageWithImage).not.toHaveBeenCalled();
  });
});