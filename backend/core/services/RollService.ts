import { DiceService } from "./DiceService";
import {
  DiceArray,
  Result,
  DiceTypesToDisplay
} from "../../shared/types";
import { AttachmentBuilder, CommandInteraction, ButtonInteraction } from "discord.js";
import { DatabaseService } from "./DatabaseService";
import { DiscordService } from "./DiscordService";
import {
  maxDiceSides,
  maxImageDice
} from "../constants";
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
    const match = notation.match(/(\d*)d(\d+|F)/i);
    if (!match) {
      return { isOverMax: false, containsDice: false };
    }

    const [_, count, sides] = match;
    const totalDiceRolled = count === "" ? 1 : parseInt(count);
    const isFudge = sides.toUpperCase() === 'F';
    const highestDiceSide = isFudge ? 6 : parseInt(sides);

    const isOverMax = totalDiceRolled > maxImageDice || highestDiceSide > maxDiceSides;

    return { isOverMax, containsDice: true };
  }

  public async rollDice(options: RollOptions): Promise<RollResult> {
    const {
      notation,
      timesToRepeat,
      interaction,
      channelId,
      username,
      source = interaction ? 'discord' : 'web'
    } = options;

    const notationArray = this.normalizeNotation(notation);

    const rollResult = await this.diceService.rollDice(notationArray, [4, 6, 8, 10, 12, 20, 100] as DiceTypesToDisplay[], timesToRepeat);

    const {
      diceArray,
      resultArray,
      errors,
      files
    } = rollResult;

    const result: RollResult = {
      diceArray,
      resultArray,
      errors,
      files
    };

    if (source === 'web' && channelId) {
      let channelName = 'unknown channel';
      let guildName = '';

      const channel = await this.discordService.getChannel(channelId);
      if (channel) {
        channelName = channel.name || channelName;
        guildName = channel.guild?.name || '';
      }

      
      if (channel && diceArray.some(group => group.length > 0)) {
        let rollingMessageResult;
        let skipDelay = false;

        if (channel.guild?.id) {
          const guildSettings = await this.dbService.getGuildSettings(channel.guild.id);
          skipDelay = guildSettings.skipDiceDelay;
        }

        const numericResults = diceArray.flat().map(die => die.rolled);
        let messageReference = null;

        if (!skipDelay) {
          const rollingMessage = this.diceService.generateDiceRolledMessage(diceArray, numericResults);
          rollingMessageResult = await this.discordService.sendMessage(channelId, { content: rollingMessage });
          
          if (!rollingMessageResult.success) {
            if (rollingMessageResult.error === "PERMISSION_ERROR") {
              result.message = 'Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊';
              result.errors = ['PERMISSION_ERROR'];
              return result;
            }
          } else if (rollingMessageResult?.success) {
            messageReference = rollingMessageResult.messageId;
          }
        }

        let diceAttachment;
        try {
          diceAttachment = await this.diceService.generateDiceAttachment(diceArray);
          if (diceAttachment) {

            const embedMessage = await this.diceService.generateEmbedMessage({
              resultArray,
              attachment: diceAttachment.attachment,
              source: 'web',
              username,
            });

            const sendResult = await this.discordService.sendMessage(channelId, {
              embeds: embedMessage.embeds,
              files: embedMessage.files,
              ...(messageReference ? { reply: { messageReference } } : {})
            });
            
            if (!sendResult.success && sendResult.error === "PERMISSION_ERROR") {
              result.message = 'Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊';
              result.errors = ['PERMISSION_ERROR'];
              return result;
            }


            try {
              const files = [{
                name: 'currentDice.webp',
                attachment: Buffer.isBuffer(diceAttachment.attachment) ? diceAttachment.attachment : null
              }].filter(file => file.attachment !== null);

              sendLogEventMessage({
                eventType: EventType.RECEIVED_COMMAND,
                args: Array.isArray(notation) ? notation : [notation],
                guild: channel.guild ? channel.guild : undefined,
                files: files.length > 0 ? files.map(file => {
                if (file.attachment && Buffer.isBuffer(file.attachment)) {
                  return new AttachmentBuilder(file.attachment, { name: file.name || 'attachment.webp' });
                }
                return new AttachmentBuilder(
                  file.attachment ? 
                    (Buffer.isBuffer(file.attachment) ? file.attachment : Buffer.from([])) : 
                    Buffer.from([]), 
                  { name: file.name || 'empty.webp' }
                );
              }) : undefined,
                sourceName: 'web',
                username,
                channelName,
                guildName
              }).catch(() => {});
            } catch (logError) {
            }
          }
        } catch (error) {
          // Handle error silently
        }
      }

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
