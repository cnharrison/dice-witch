import { randomUUID } from "crypto";
import { RollService } from "../../core/services/RollService";
import { DiscordService } from "../../core/services/DiscordService";
import { DatabaseService } from "../../core/services/DatabaseService";
import { CommandProps, EventType } from "../../shared/types";
import sendLogEventMessage from "../messages/sendLogEventMessage";
import {
  sendDiceOverMaxMessage,
  sendDiceResultMessageWithImage,
  sendDiceRolledMessage,
  sendHelperMessage,
  sendNeedPermissionMessage
} from "../messages";
import { CONFIG } from "../../config";

function sendShardMessage(interaction: CommandProps['interaction'], payload: Record<string, unknown>): void {
  if (interaction && interaction.client?.shard != null && typeof process.send === 'function') {
    process.send({ shardId: interaction.client.shard.ids[0], ...payload });
  }
}

const command = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage: "[dice notation], e.g. 1d20 2d12. Type `/roll` for a detailed explanation",

  async execute({
    args,
    interaction,
    title,
    timesToRepeat,
  }: CommandProps) {
    try {
      if (interaction && !interaction.deferred && !interaction.replied && typeof interaction.deferReply === 'function') {
        await interaction.deferReply();
      }

      sendShardMessage(interaction, {
        type: 'roll_command_start',
        timestamp: Date.now(),
        interactionId: interaction?.id,
        guildId: interaction?.guildId,
        channelId: interaction?.channelId,
        userId: interaction?.user?.id,
        dice: args.join(' ')
      });

      if (!args.length && interaction) {
        await sendHelperMessage({ interaction });
        return;
      }

      const discordService = DiscordService.getInstance();
      if (!discordService.checkForAttachPermission(interaction)) {
        await sendNeedPermissionMessage({ interaction });
        return;
      }

      const rollService = RollService.getInstance();
      const { isOverMax, containsDice, unsafeNotationReason } = rollService.checkDiceLimits(args, timesToRepeat);

      if (!containsDice && interaction) {
        await sendHelperMessage({ interaction });
        return;
      }

      if (isOverMax && interaction) {
        if (unsafeNotationReason) {
          console.warn(`[roll] Over max due exploding notation: ${unsafeNotationReason} | notation: ${args.join(' ')}`);
        }

        await sendDiceOverMaxMessage({
          args,
          interaction,
        });
        return;
      }

      sendShardMessage(interaction, {
        type: 'roll_processing_dice',
        timestamp: Date.now(),
        interactionId: interaction?.id,
        dice: args.join(' ')
      });

      const rollResult = await rollService.rollDice({
        notation: args,
        timesToRepeat,
        title,
        interaction,
        source: 'discord'
      });

      if (rollResult.errors?.includes("DICE_OVER_MAX") && interaction) {
        await sendDiceOverMaxMessage({
          args,
          interaction,
        });
        return;
      }

      sendShardMessage(interaction, {
        type: 'roll_dice_processed',
        timestamp: Date.now(),
        interactionId: interaction?.id,
        dice: args.join(' '),
        resultCount: rollResult.resultArray.length
      });

      const { diceArray, resultArray } = rollResult;

      const hasResults = resultArray.length > 0 && resultArray.some(r => r.output);

      if (!hasResults && interaction) {
        await sendHelperMessage({ interaction });
        return;
      }

      let skipDelay = false;
      if (interaction?.guildId) {
        const databaseService = DatabaseService.getInstance();
        const guildSettings = await databaseService.getGuildSettings(interaction.guildId);
        skipDelay = guildSettings.skipDiceDelay;
      }

      if (!skipDelay) {
        await sendDiceRolledMessage({ diceArray, interaction });
      }

      sendShardMessage(interaction, {
        type: 'roll_generating_image',
        timestamp: Date.now(),
        interactionId: interaction?.id,
        diceCount: diceArray.length
      });

      const diceService = await import("../../core/services/DiceService").then(mod => mod.DiceService.getInstance());
      const attachmentName = `dice-${interaction?.id ?? randomUUID()}.webp`;
      const attachmentResult = await diceService.generateDiceAttachment(diceArray, attachmentName);

      if (!attachmentResult) {
        console.error("Failed to generate dice attachment");
        sendLogEventMessage({
          eventType: EventType.IMAGE_RENDER_ERROR,
          command,
          args,
          interaction,
          resultMessage: `Failed to generate dice attachment for: ${args.join(' ')}`,
          logChannelId: CONFIG.discord.renderErrorChannelId
        }).catch(() => {});
        sendShardMessage(interaction, {
          type: 'error',
          errorType: 'DICE_ATTACHMENT_GENERATION_ERROR',
          message: "Failed to generate dice attachment",
          timestamp: Date.now(),
          context: {
            commandName: 'roll',
            interactionId: interaction?.id,
            guildId: interaction?.guildId,
            channelId: interaction?.channelId,
            userId: interaction?.user?.id,
            diceCount: diceArray.length
          }
        });
        return;
      }

      if (attachmentResult.errors?.length) {
        sendLogEventMessage({
          eventType: EventType.IMAGE_RENDER_ERROR,
          command,
          args,
          interaction,
          resultMessage: `Image render errors: ${attachmentResult.errors.join(", ")}`,
          files: [attachmentResult.attachment],
          logChannelId: CONFIG.discord.renderErrorChannelId
        }).catch(() => {});
      }

      sendShardMessage(interaction, {
        type: 'roll_image_generated',
        timestamp: Date.now(),
        interactionId: interaction?.id,
      });

      const { attachment } = attachmentResult;

      sendShardMessage(interaction, {
        type: 'roll_sending_result',
        timestamp: Date.now(),
        interactionId: interaction?.id,
      });

      await sendDiceResultMessageWithImage({
        resultArray,
        attachment,
        interaction,
        title
      }).then(() => {
        sendShardMessage(interaction, {
          type: 'roll_result_sent',
          timestamp: Date.now(),
          interactionId: interaction?.id,
        });
      }).catch(err => {
        sendShardMessage(interaction, {
          type: 'error',
          errorType: 'SEND_RESULT_ERROR',
          message: err?.message || String(err),
          stack: err?.stack,
          timestamp: Date.now(),
          context: {
            commandName: 'roll',
            interactionId: interaction?.id,
            guildId: interaction?.guildId,
            channelId: interaction?.channelId,
            userId: interaction?.user?.id,
          }
        });
      });

    } catch (error) {
      console.error('Error in roll command:', error);
      if (interaction?.isRepliable() && !interaction.replied && typeof interaction.reply === 'function') {
        await interaction.reply({ content: "Something went wrong with your dice roll.", ephemeral: true });
      }
    }
  },
};

export default command;
