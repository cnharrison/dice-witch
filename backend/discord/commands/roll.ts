import { RollService } from "../../core/services/RollService";
import { DiscordService } from "../../core/services/DiscordService";
import { DatabaseService } from "../../core/services/DatabaseService";
import { RollProps } from "../../shared/types";
import {
  sendDiceOverMaxMessage,
  sendDiceResultMessage,
  sendDiceResultMessageWithImage,
  sendDiceRolledMessage,
  sendHelperMessage,
  sendNeedPermissionMessage
} from "../messages";

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
  }: RollProps) {
    try {
      if (interaction) {
        const interactionId = interaction.id;
        const timestamp = Date.now();

        if (typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
          process.send({
            type: 'roll_command_start',
            timestamp: timestamp,
            interactionId: interactionId,
            shardId: interaction.client.shard?.ids[0],
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            userId: interaction.user.id,
            dice: args.join(' ')
          });
        }
      }


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
      const firstArg = args[0] || '';
      const { isOverMax, containsDice } = rollService.checkDiceLimits(firstArg);

      if (!containsDice && interaction) {
        await sendHelperMessage({ interaction });
        return;
      }

      if (isOverMax && interaction) {
        await sendDiceOverMaxMessage({
          args,
          interaction,
        });
        return;
      }

      if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
        process.send({
          type: 'roll_processing_dice',
          timestamp: Date.now(),
          interactionId: interaction.id,
          shardId: interaction.client.shard?.ids[0],
          dice: args.join(' ')
        });
      }

      const rollResult = await rollService.rollDice({
        notation: args,
        timesToRepeat,
        title,
        interaction,
        source: 'discord'
      });

      if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
        process.send({
          type: 'roll_dice_processed',
          timestamp: Date.now(),
          interactionId: interaction.id,
          shardId: interaction.client.shard?.ids[0],
          dice: args.join(' '),
          resultCount: rollResult.resultArray.length
        });
      }

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

      if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
        process.send({
          type: 'roll_generating_image',
          timestamp: Date.now(),
          interactionId: interaction.id,
          shardId: interaction.client.shard?.ids[0],
          diceCount: diceArray.length
        });
      }

      const diceService = await import("../../core/services/DiceService").then(mod => mod.DiceService.getInstance());
      const attachmentResult = await diceService.generateDiceAttachment(diceArray);

      if (!attachmentResult) {
        console.error("Failed to generate dice attachment");
        if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
          process.send({
            type: 'error',
            errorType: 'DICE_ATTACHMENT_GENERATION_ERROR',
            message: "Failed to generate dice attachment",
            shardId: interaction.client.shard?.ids[0],
            timestamp: Date.now(),
            context: {
              commandName: 'roll',
              interactionId: interaction.id,
              guildId: interaction.guildId,
              channelId: interaction.channelId,
              userId: interaction.user.id,
              diceCount: diceArray.length
            }
          });
        }
        return;
      }

      if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
        process.send({
          type: 'roll_image_generated',
          timestamp: Date.now(),
          interactionId: interaction.id,
          shardId: interaction.client.shard?.ids[0]
        });
      }

      const { attachment, canvas } = attachmentResult;
      if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
        process.send({
          type: 'roll_sending_result',
          timestamp: Date.now(),
          interactionId: interaction.id,
          shardId: interaction.client.shard?.ids[0]
        });
      }

      await sendDiceResultMessageWithImage({
        resultArray,
        attachment,
        canvas,
        interaction,
        title
      }).then(() => {
        if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
          process.send({
            type: 'roll_result_sent',
            timestamp: Date.now(),
            interactionId: interaction.id,
            shardId: interaction.client.shard?.ids[0]
          });
        }
      }).catch(err => {
        if (interaction && typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
          process.send({
            type: 'error',
            errorType: 'SEND_RESULT_ERROR',
            message: err?.message || String(err),
            stack: err?.stack,
            shardId: interaction.client.shard?.ids[0],
            timestamp: Date.now(),
            context: {
              commandName: 'roll',
              interactionId: interaction.id,
              guildId: interaction.guildId,
              channelId: interaction.channelId,
              userId: interaction.user.id
            }
          });
        }
      });

    } catch (error) {
      console.error('Error in roll command:', error);
      if (interaction?.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "Something went wrong with your dice roll. Please try again.", ephemeral: true });
      }
    }
  },
};

export default command;