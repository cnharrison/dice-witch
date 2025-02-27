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
  shouldHaveImage: boolean;
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

  public checkDiceLimits(notation: string): { isOverMax: boolean; shouldHaveImage: boolean } {
    const match = notation.match(/(\d+)d(\d+)/i);
    if (!match) {
      return { isOverMax: false, shouldHaveImage: false };
    }

    const [_, count, sides] = match;
    const totalDiceRolled = parseInt(count);
    const highestDiceSide = parseInt(sides);
    const shouldHaveImage = availableDice.includes(highestDiceSide as DiceTypesToDisplay);

    const isOverMax = (shouldHaveImage && totalDiceRolled > maxImageDice) ||
                     (!shouldHaveImage && (totalDiceRolled > maxTextDice || highestDiceSide > maxDiceSides));

    return { isOverMax, shouldHaveImage };
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
      shouldHaveImage,
      errors,
      files
    } = await this.diceService.rollDice(notationArray, availableDice, timesToRepeat);

    const result: RollResult = {
      diceArray,
      resultArray,
      shouldHaveImage: Boolean(shouldHaveImage),
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

      if (shouldHaveImage && diceArray.some(group => group.length > 0)) {
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

          if (channel) {
            await this.discordService.sendMessage(channelId, {
              embeds: embedMessage.embeds,
              files: embedMessage.files
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
      } else if (resultArray.length > 0 && channel) {
        try {
          const embedMessage = await this.diceService.generateEmbedMessage({
            resultArray,
            attachment: null,
            source: 'web',
            username
          });

          if (embedMessage.embeds.length > 0) {
            await this.discordService.sendMessage(channelId, {
              embeds: embedMessage.embeds,
              files: []
            });
          }

          await sendLogEventMessage({
            eventType: EventType.RECEIVED_COMMAND,
            args: Array.isArray(notation) ? notation : [notation],
            guild: channel.guild,
            sourceName: 'web',
            username,
            channelName,
            guildName
          });
        } catch (error) {
          console.error('Error sending text-only dice roll to Discord:', error);
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