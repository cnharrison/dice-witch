import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { DiceArray, Result } from '../../shared/types';

// Mock DiceService
export class DiceServiceMock {
  private static instance: DiceServiceMock;

  private constructor() {}

  public static getInstance(): DiceServiceMock {
    if (!DiceServiceMock.instance) {
      DiceServiceMock.instance = new DiceServiceMock();
    }
    return DiceServiceMock.instance;
  }

  public async rollDice(args: string[], availableDice: any[]): Promise<any> {
    // Special case for handling the invalid notation test
    if (args.includes('invalid')) {
      return {
        diceArray: [],
        resultArray: [],
        errors: ['Invalid notation']
      };
    }

    // Special case for 2d20+5
    if (args.includes('2d20 + 5')) {
      return {
        diceArray: [
          [
            {
              sides: 20,
              rolled: 10,
              color: { hex: () => '#FF0000' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 10
            },
            {
              sides: 20,
              rolled: 15,
              color: { hex: () => '#FF0000' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 15
            }
          ]
        ],
        resultArray: [
          {
            output: `${args[0]}: 30`,
            results: 30 // 10 + 15 + 5
          }
        ],
        shouldHaveImage: true,
        files: [new AttachmentBuilder(Buffer.from('test'))]
      };
    }

    if (args.some(arg => arg.includes('d9'))) {
      return {
        diceArray: args.map(arg => {
          if (arg.includes('+')) {
            const parts = arg.split('+');
            return parts.flatMap(part => {
              const sides = parseInt(part.split('d')[1]) || 6;
              const count = parseInt(part.split('d')[0]) || 1;
              
              return Array(count).fill(null).map(() => ({
                sides,
                rolled: 3,
                color: { hex: () => '#FF0000' },
                secondaryColor: { hex: () => '#0000FF' },
                textColor: { hex: () => '#FFFFFF' },
                value: 3
              }));
            });
          } else {
            const sides = parseInt(arg.split('d')[1]) || 6;
            const count = parseInt(arg.split('d')[0]) || 1;
            
            return Array(count).fill(null).map(() => ({
              sides,
              rolled: 3,
              color: { hex: () => '#FF0000' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 3
            }));
          }
        }),
        resultArray: args.map(arg => ({
          output: `${arg}: ${arg.includes('d9') ? 15 : 3}`,
          results: arg.includes('d9') ? 15 : 3
        })),
        shouldHaveImage: true,
        files: [new AttachmentBuilder(Buffer.from('test'))]
      };
    }
    
    if (args.some(arg => arg.includes('+') && (arg.includes('d9') || arg.includes('d6')))) {
      return {
        diceArray: [
          [
            {
              sides: 9,
              rolled: 3,
              color: { hex: () => '#FF0000' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 3
            },
            {
              sides: 9,
              rolled: 3,
              color: { hex: () => '#FF0000' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 3
            }
          ],
          [
            {
              sides: 6,
              rolled: 3,
              color: { hex: () => '#00FF00' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 3
            },
            {
              sides: 6,
              rolled: 3,
              color: { hex: () => '#00FF00' },
              secondaryColor: { hex: () => '#0000FF' },
              textColor: { hex: () => '#FFFFFF' },
              value: 3
            }
          ]
        ],
        resultArray: [
          {
            output: `${args[0]}: 21`,
            results: 21
          }
        ],
        shouldHaveImage: true,
        files: [new AttachmentBuilder(Buffer.from('test'))]
      };
    }

    return {
      diceArray: args.map(arg => [
        {
          sides: parseInt(arg.split('d')[1]) || 6,
          rolled: 3,
          color: { hex: () => '#FF0000' },
          secondaryColor: { hex: () => '#0000FF' },
          textColor: { hex: () => '#FFFFFF' },
          value: 3
        }
      ]),
      resultArray: args.map(arg => ({
        output: `${arg}: 3`,
        results: 3
      })),
      shouldHaveImage: true,
      files: [new AttachmentBuilder(Buffer.from('test'))]
    };
  }

  public async generateDiceAttachment(diceArray: any): Promise<any> {
    return {
      attachment: new AttachmentBuilder(Buffer.from('test')),
      canvas: {
        toBuffer: () => Buffer.from('test')
      }
    };
  }

  public async generateEmbedMessage(params: any): Promise<any> {
    return {
      embeds: [new EmbedBuilder().setDescription('Test roll')],
      files: params.attachment ? [params.attachment] : [new AttachmentBuilder(Buffer.from('test'))]
    };
  }

  public generateDiceRolledMessage = jest.fn().mockReturnValue('_...the dice clatter across the table..._');
}

// Mock RollService
export class RollServiceMock {
  private static instance: RollServiceMock;
  private diceService: DiceServiceMock;

  private constructor() {
    this.diceService = DiceServiceMock.getInstance();
  }

  public static getInstance(): RollServiceMock {
    if (!RollServiceMock.instance) {
      RollServiceMock.instance = new RollServiceMock();
    }
    return RollServiceMock.instance;
  }

  public checkDiceLimits(notation: string): { isOverMax: boolean } {
    const isOverMax = notation.includes('100d');
    return { isOverMax };
  }

  public async rollDice(options: any): Promise<any> {
    const notation = Array.isArray(options.notation) ? options.notation : [options.notation];
    const isWeb = options.source === 'web';
    const isDiscord = options.source === 'discord' || options.interaction;
    
    // Special handling for initiative roll tests
    if (options.title && options.title.includes('Initiative')) {
      const modifier = options.title.includes('Rogue') ? 4 :
                      options.title.includes('Fighter') ? 2 : 
                      options.title.includes('Wizard') ? -1 : 0;
      
      const rollValue = 10; // Base value
      const total = rollValue + modifier;
      
      return {
        diceArray: [[{
          sides: 20,
          rolled: rollValue,
          color: { hex: () => '#FF0000' },
          secondaryColor: { hex: () => '#0000FF' },
          textColor: { hex: () => '#FFFFFF' },
          value: rollValue
        }]],
        resultArray: [{
          output: `1d20${modifier >= 0 ? '+' + modifier : modifier}: ${total}`,
          results: total
        }],
        files: [new AttachmentBuilder(Buffer.from('test'))],
        base64Image: isWeb && options.channelId ? 'base64-image-data' : undefined,
        message: isWeb && options.channelId ? `Message sent to Discord channel test-channel` : undefined,
        channelName: isWeb && options.channelId ? 'test-channel' : undefined,
        guildName: isWeb && options.channelId ? 'Test Guild' : undefined,
        source: isWeb ? 'web' : 'discord'
      };
    }
    
    // Regular handling for other cases
    const availableDice = [4, 6, 8, 10, 12, 20, 100];
    const { diceArray, resultArray, files } = await this.diceService.rollDice(
      notation, 
      availableDice
    );

    return {
      diceArray,
      resultArray,
      files: isDiscord ? files : [new AttachmentBuilder(Buffer.from('test'))],
      base64Image: isWeb && options.channelId ? 'base64-image-data' : undefined,
      message: isWeb && options.channelId ? `Message sent to Discord channel test-channel` : undefined,
      channelName: isWeb && options.channelId ? 'test-channel' : undefined,
      guildName: isWeb && options.channelId ? 'Test Guild' : undefined,
      source: isWeb ? 'web' : 'discord'
    };
  }
}

// Mock DiscordService
export class DiscordServiceMock {
  private static instance: DiscordServiceMock;
  private client: any = null;
  private manager: any = null;

  private constructor() {}

  public static getInstance(): DiscordServiceMock {
    if (!DiscordServiceMock.instance) {
      DiscordServiceMock.instance = new DiscordServiceMock();
    }
    return DiscordServiceMock.instance;
  }

  public setClient(client: any) {
    this.client = client;
  }

  public setManager(manager: any) {
    this.manager = manager;
  }

  public getClient(): any {
    return this.client;
  }

  public getManager(): any {
    return this.manager;
  }

  public async getUserCount(): Promise<any> {
    return { totalGuilds: 5, totalMembers: 500 };
  }

  public checkForAttachPermission(interaction?: any): boolean {
    return true;
  }

  public async getChannel(channelId: string) {
    if (channelId === 'valid-channel' || channelId === 'test-channel') {
      return {
        id: channelId,
        name: 'test-channel',
        type: 0,
        guild: {
          id: 'test-guild',
          name: 'Test Guild'
        }
      };
    }
    return null;
  }

  public async sendMessage(channelId: string, options: any): Promise<any> {
    const isValidChannel = channelId === 'valid-channel' || channelId === 'test-channel';
    if (isValidChannel) {
      return {
        success: true,
        messageId: 'test-message-id',
        channelId: channelId
      };
    }
    return { success: false };
  }
}