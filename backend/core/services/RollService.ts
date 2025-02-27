import { DiceService } from "./DiceService";
import {
  DiceArray,
  DiceTypesToDisplay,
  Result,
  GenerateEmbedMessageParams
} from "../../shared/types";
import { AttachmentBuilder, CommandInteraction, ButtonInteraction } from "discord.js";
import { DatabaseService } from "./DatabaseService";
import { DiscordService } from "./DiscordService";
import {
  availableDice,
  maxDiceSides,
  maxImageDice,
  maxTextDice
} from "../constants";
import { getHighestDiceSide, getTotalDiceRolled } from "../../shared/helpers";
import { EventType } from "../../shared/types";
import { sendLogEventMessage } from "../../discord/messages/sendLogEventMessage";

export interface RollOptions {
  notation: string | string[];
  timesToRepeat?: number;
  title?: string;

  interaction?: CommandInteraction | ButtonInteraction;

  channelId?: string;
  username?: string;
  source?: 'discord' | 'web';
}

export interface RollResult {
  diceArray: DiceArray;
  resultArray: Result[];
  errors?: string[];
  files?: AttachmentBuilder[];
  base64Image?: string; // For web response
  message?: string; // For web response
  channelName?: string; // For web response
  guildName?: string; // For web response
}

export class RollService {
  private static instance: RollService;
  private diceService: DiceService;
  private discordService: DiscordService;
  private dbService: DatabaseService;

  private constructor() {
    this.diceService = DiceService.getInstance();
    this.discordService = DiscordService.getInstance();
    this.dbService = DatabaseService.getInstance();
  }

  public static getInstance(): RollService {
    if (!RollService.instance) {
      RollService.instance = new RollService();
    }
    return RollService.instance;
  }

  private normalizeNotation(notation: string | string[]): string[] {
    return Array.isArray(notation) ? notation : [notation];
  }

  public checkDiceLimits(notation: string): { isOverMax: boolean; containsDice: boolean } {
    const match = notation.match(/(\d+)d(\d+)/i);
    if (!match) {
      return { isOverMax: false, containsDice: false };
    }

    const [_, count, sides] = match;
    const totalDiceRolled = parseInt(count);
    const highestDiceSide = parseInt(sides);
    
    const isOverMax = totalDiceRolled > maxImageDice || highestDiceSide > maxDiceSides;
    
    return { isOverMax, containsDice: true };
  }

  public async rollDice(options: RollOptions): Promise<RollResult> {
    const {
      notation,
      timesToRepeat,
      title,
      interaction,
      channelId,
      username,
      source = interaction ? 'discord' : 'web'
    } = options;

    const notationArray = this.normalizeNotation(notation);

    const {
      diceArray,
      resultArray,
      errors,
      files
    } = await this.diceService.rollDice(notationArray, availableDice, timesToRepeat);

    const result: RollResult = {
      diceArray,
      resultArray,
      errors,
      files
    };

    if (source === 'web' && channelId) {
      let base64Image = '';
      let channelName = 'unknown channel';
      let guildName = '';

      const channel = await this.discordService.getChannel(channelId);
      if (channel) {
        channelName = channel.name || channelName;
        guildName = channel.guild?.name || '';
      }

      if (channel && diceArray.some(group => group.length > 0)) {
        let rollingMessageResult;
        
        const numericResults = diceArray.flat().map(die => die.rolled);
        const rollingMessage = this.diceService.generateDiceRolledMessage(diceArray, numericResults);
        rollingMessageResult = await this.discordService.sendMessage(channelId, { content: rollingMessage });
        
        const diceAttachment = await this.diceService.generateDiceAttachment(diceArray);
        if (diceAttachment) {
          const imageBuffer = diceAttachment.canvas.toBuffer('image/webp');
          base64Image = Buffer.from(imageBuffer).toString('base64');

          const embedMessage = await this.diceService.generateEmbedMessage({
            resultArray,
            attachment: diceAttachment.attachment,
            source: 'web',
            username
          });

          if (rollingMessageResult?.success) {
            await this.discordService.sendMessage(channelId, {
              embeds: embedMessage.embeds,
              files: embedMessage.files,
              reply: { messageReference: rollingMessageResult.messageId }
            });

            try {
              const files = [{
                name: 'currentDice.png',
                attachment: Buffer.isBuffer(diceAttachment.attachment) ? diceAttachment.attachment : null
              }].filter(file => file.attachment !== null);

              await sendLogEventMessage({
                eventType: EventType.RECEIVED_COMMAND,
                args: Array.isArray(notation) ? notation : [notation],
                guild: channel.guild,
                files: files.length > 0 ? files : undefined,
                sourceName: 'web',
                username,
                channelName,
                guildName
              });
            } catch (error) {
              console.error('Failed to send to log channel:', error);
            }
          }
        }
      }

      // Add web-specific fields to the result
      result.base64Image = base64Image;
      result.message = `Message sent to Discord channel ${channelName}`;
      result.channelName = channelName;
      result.guildName = guildName;
    }

    if (interaction) {
      await this.dbService.updateOnCommand({
        commandName: "roll",
        interaction
      });
    }

    return result;
  }
}