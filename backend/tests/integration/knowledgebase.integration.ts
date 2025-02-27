import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { CommandInteraction } from 'discord.js';

// Mock dependencies
jest.mock('../../config', () => ({
  CONFIG: {
    discord: {
      inviteLink: 'https://mock-invite.com',
      supportServerLink: 'https://mock-support.com'
    }
  }
}));

// Import after mocking dependencies
import knowledgebaseCommand from '../../discord/commands/knowledgebase';

// Mock interaction
const createMockInteraction = () => {
  return {
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferred: true,
  } as unknown as CommandInteraction;
};

describe('Knowledgebase Command Tests', () => {
  let mockInteraction: CommandInteraction;

  beforeEach(() => {
    mockInteraction = createMockInteraction();
    jest.clearAllMocks();
  });

  test('should show index when no arguments provided', async () => {
    await knowledgebaseCommand.execute({
      args: [],
      interaction: mockInteraction,
    });

    expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
    const call = mockInteraction.editReply.mock.calls[0][0];
    expect(call).toHaveProperty('embeds');
    expect(call.embeds[0].data.title).toBe('👩‍🎓 Knowledge base');
    expect(call.embeds[0].data.fields[0].name).toBe('Available topics');
    expect(call.embeds[0].data.fields[0].value).toContain('Type `/knowledgebase <topic>` to learn more');
  });

  test('should show math topic when "math" argument provided', async () => {
    await knowledgebaseCommand.execute({
      args: ['math'],
      interaction: mockInteraction,
    });

    expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
    const call = mockInteraction.editReply.mock.calls[0][0];
    expect(call).toHaveProperty('embeds');
    expect(call.embeds[0].data.title).toBe('👩‍🎓 Knowledge base');
    
    // Verify math topic content is present
    const fields = call.embeds[0].data.fields;
    expect(fields.length).toBeGreaterThanOrEqual(1);
    expect(fields[0].name).toBe('Math');
    expect(fields[0].value).toContain('You can use add, subtract, multiply, divide');
  });

  test('should show exploding topic when "exploding" argument provided', async () => {
    await knowledgebaseCommand.execute({
      args: ['exploding'],
      interaction: mockInteraction,
    });

    expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
    const call = mockInteraction.editReply.mock.calls[0][0];
    expect(call).toHaveProperty('embeds');
    
    // Verify exploding topic content is present
    const fields = call.embeds[0].data.fields;
    expect(fields.length).toBeGreaterThanOrEqual(1);
    expect(fields.some(field => field.name === 'Exploding dice')).toBe(true);
    expect(fields.some(field => field.name === 'Compounding')).toBe(true);
    expect(fields.some(field => field.name === 'Penetrating')).toBe(true);
  });

  test('should show index when invalid topic provided', async () => {
    await knowledgebaseCommand.execute({
      args: ['nonexistenttopic'],
      interaction: mockInteraction,
    });

    expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
    const call = mockInteraction.editReply.mock.calls[0][0];
    expect(call).toHaveProperty('embeds');
    expect(call.embeds[0].data.title).toBe('👩‍🎓 Knowledge base');
    expect(call.embeds[0].data.fields[0].name).toBe('Available topics');
  });
});