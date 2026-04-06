import { randomUUID } from "crypto";
import { AttachmentBuilder, CommandInteraction, ButtonInteraction } from "discord.js";
import { Parser } from "@dice-roller/rpg-dice-roller";
import { DiceService } from "./DiceService";
import { DatabaseService } from "./DatabaseService";
import { DiscordService } from "./DiscordService";
import { DiceArray, Result, DiceTypesToDisplay, EventType } from "../../shared/types";
import { maxDiceSides, maxImageDice } from "../constants";
import { sendLogEventMessage } from "../../discord/messages/sendLogEventMessage";

/**
 * Parse a raw notation string into an array of notation terms.
 *
 * If the full string is valid dice notation (e.g. "2d20 + 5"), it is kept as
 * a single element so operators and whitespace are preserved.
 *
 * If parsing fails (e.g. "2d20 1d10"), the string is split on whitespace so
 * each space-separated term is rolled individually (multi-roll).
 *
 * Canonical entry point used by both Discord and web so both mediums behave
 * identically.
 */
export function parseNotationArgs(rawNotation: string): string[] {
  const trimmed = rawNotation.trim();
  if (!trimmed) return [];
  try {
    Parser.parse(trimmed);
    return [trimmed];
  } catch {
    return trimmed.split(/ +/).filter(Boolean);
  }
}

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

  private getRepeatMultiplier(timesToRepeat?: number): number {
    const n = timesToRepeat as number;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }

  private isDiceNode(node: any): boolean {
    return !!node
      && typeof node === "object"
      && Number.isFinite(node.qty)
      && Number.isFinite(node.min)
      && Number.isFinite(node.max)
      && node.modifiers;
  }

  private getSidesInfoFromParsedDice(sidesRaw: unknown, min: number, max: number): {
    sidesForLimit: number;
    sidesLabel: string;
  } {
    if (typeof sidesRaw === "string") {
      const s = sidesRaw.toUpperCase();
      if (s === "%") return { sidesForLimit: 100, sidesLabel: "%" };
      if (s.startsWith("F")) return { sidesForLimit: 6, sidesLabel: "F" };
      const n = Number.parseInt(s, 10);
      if (Number.isFinite(n)) return { sidesForLimit: n, sidesLabel: `${n}` };
    }
    if (typeof sidesRaw === "number" && Number.isFinite(sidesRaw)) {
      return { sidesForLimit: sidesRaw, sidesLabel: `${sidesRaw}` };
    }
    const inferred = Number.isFinite(max) ? max : Math.max(1, min);
    return { sidesForLimit: inferred, sidesLabel: `${inferred}` };
  }

  private collectDiceNodes(node: any, acc: any[]): void {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(item => this.collectDiceNodes(item, acc));
      return;
    }
    if (typeof node !== "object") return;
    if (this.isDiceNode(node)) {
      acc.push(node);
      return;
    }
    if (Array.isArray(node.expressions)) {
      this.collectDiceNodes(node.expressions, acc);
    }
  }

  private compareValue(value: number, operator: string, compareValue: number): boolean {
    switch (operator) {
      case "=":
      case "==":
        return value === compareValue;
      case ">":
        return value > compareValue;
      case ">=":
        return value >= compareValue;
      case "<":
        return value < compareValue;
      case "<=":
        return value <= compareValue;
      case "!=":
      case "<>":
      case "!":
        return value !== compareValue;
      default:
        return false;
    }
  }

  private getComparisonProbability(min: number, max: number, operator: string, compareValue: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      return 0;
    }

    const outcomes = max - min + 1;
    let matchingOutcomes = 0;

    for (let value = min; value <= max; value += 1) {
      if (this.compareValue(value, operator, compareValue)) {
        matchingOutcomes += 1;
      }
    }

    return matchingOutcomes / outcomes;
  }

  private getUnsafeNotationReason(diceNodes: any[], repeatMultiplier: number): string | undefined {
    const EPSILON = 1e-9;
    let hasExplodingDice = false;
    let expectedDice = 0;

    for (const die of diceNodes) {
      const quantity = Math.max(1, Number.isFinite(die.qty) ? Number(die.qty) : 1);
      const explodeModifier = die.modifiers?.get?.("explode");

      if (!explodeModifier) {
        expectedDice += quantity;
        continue;
      }

      hasExplodingDice = true;

      // Compound explosions always render as `quantity` dice regardless of how many times they explode.
      if (explodeModifier.compound === true) {
        expectedDice += quantity;
        continue;
      }

      const min = Number(die.min);
      const max = Number(die.max);
      const operator = typeof explodeModifier.comparePoint?.operator === "string"
        ? explodeModifier.comparePoint.operator
        : "=";
      const compareValue = Number.isFinite(explodeModifier.comparePoint?.value)
        ? Number(explodeModifier.comparePoint.value)
        : max;

      const p = this.getComparisonProbability(min, max, operator, compareValue);

      if (p >= 1 - EPSILON) {
        return `Expected exploded dice count exceeds the ${maxImageDice} dice image limit.`;
      }

      expectedDice += quantity * (1 / (1 - p));
    }

    if (!hasExplodingDice) return undefined;

    const total = expectedDice * repeatMultiplier;
    if (total > maxImageDice + EPSILON) {
      return `Expected exploded dice count ${Math.ceil(total - EPSILON)} exceeds the ${maxImageDice} dice image limit.`;
    }

    return undefined;
  }

  public checkDiceLimits(
    notation: string | string[],
    timesToRepeat: number = 1
  ): { isOverMax: boolean; containsDice: boolean; unsafeNotationReason?: string } {
    const notationArray = this.normalizeNotation(notation);
    const repeatMultiplier = this.getRepeatMultiplier(timesToRepeat);
    const diceTokenRegex = /(\d*)d(\d+|%|F(?:\.\d+)?)/gi;
    const containsDice = notationArray.some(chunk => diceTokenRegex.test(chunk));

    if (!containsDice) {
      return { isOverMax: false, containsDice: false };
    }

    const parsedDiceNodes: any[] = [];

    for (const chunk of notationArray) {
      if (!chunk.trim()) continue;
      try {
        const parsedChunk = Parser.parse(chunk.trim());
        this.collectDiceNodes(parsedChunk, parsedDiceNodes);
      } catch {
        // This chunk is invalid notation — leave limit enforcement to the roll
        // parser downstream. Return containsDice:true so the roll proceeds and
        // produces a proper user-facing invalid-notation error rather than the
        // over-max message.
        return { isOverMax: false, containsDice: true };
      }
    }

    if (parsedDiceNodes.length === 0) {
      return { isOverMax: false, containsDice: true };
    }

    let totalDiceRolled = 0;
    let highestDiceSide = 0;

    for (const die of parsedDiceNodes) {
      const quantity = Math.max(1, Number.isFinite(die.qty) ? Number(die.qty) : 1);
      const { sidesForLimit } = this.getSidesInfoFromParsedDice(die.sides, Number(die.min), Number(die.max));

      totalDiceRolled += quantity;
      highestDiceSide = Math.max(highestDiceSide, sidesForLimit);
    }

    const baseLimitExceeded = totalDiceRolled * repeatMultiplier > maxImageDice || highestDiceSide > maxDiceSides;
    const unsafeNotationReason = this.getUnsafeNotationReason(parsedDiceNodes, repeatMultiplier);
    const isOverMax = baseLimitExceeded || !!unsafeNotationReason;

    return { isOverMax, containsDice: true, unsafeNotationReason };
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

    const renderedDiceCount = diceArray.reduce((total, group) => total + group.length, 0);
    if (renderedDiceCount > maxImageDice) {
      const overMaxMessage = `${maxImageDice} dice max and ${maxDiceSides} sides max, sorry 😅`;
      return {
        diceArray: [],
        resultArray: [],
        errors: ["DICE_OVER_MAX"],
        message: overMaxMessage,
      };
    }

    const result: RollResult = {
      diceArray,
      resultArray,
      errors,
      files
    };

    if (source === 'web' && channelId) {
      const channel = await this.discordService.getChannel(channelId);
      const channelName = channel?.name || 'unknown channel';
      const guildName = channel?.guild?.name || '';

      if (channel && diceArray.some(group => group.length > 0)) {
        let skipDelay = false;
        if (channel.guild?.id) {
          const guildSettings = await this.dbService.getGuildSettings(channel.guild.id);
          skipDelay = guildSettings.skipDiceDelay;
        }

        let messageReference = null;
        if (!skipDelay) {
          const rollingMessage = this.diceService.generateDiceRolledMessage(diceArray, diceArray.flat().map(die => die.rolled));
          const rollingResult = await this.discordService.sendMessage(channelId, { content: rollingMessage });
          if (!rollingResult.success && rollingResult.error === "PERMISSION_ERROR") {
            result.message = 'Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊';
            result.errors = ['PERMISSION_ERROR'];
            return result;
          }
          messageReference = rollingResult.success ? (rollingResult.messageId ?? null) : null;
        }

        try {
          const diceAttachment = await this.diceService.generateDiceAttachment(diceArray, `dice-${randomUUID()}.webp`);
          if (!diceAttachment) {
            console.error("Failed to generate web dice attachment");
          } else {
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
              const attachmentBuffer = Buffer.isBuffer(diceAttachment.attachment) ? diceAttachment.attachment : null;
              sendLogEventMessage({
                eventType: EventType.RECEIVED_COMMAND,
                args: Array.isArray(notation) ? notation : [notation],
                guild: channel.guild ?? undefined,
                files: attachmentBuffer
                  ? [new AttachmentBuilder(attachmentBuffer, { name: 'currentDice.webp' })]
                  : undefined,
                sourceName: 'web',
                username,
                channelName,
                guildName
              }).catch((err) => console.error("Failed to send web roll log event:", err));
            } catch (logError) {
              console.error("Error building web roll log event payload:", logError);
            }
          }
        } catch (error) {
          console.error("Error generating/sending web dice attachment:", error);
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
