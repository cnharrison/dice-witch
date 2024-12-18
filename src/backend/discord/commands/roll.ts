import { DiceService } from "../../core/services/DiceService";
import { DiscordService } from "../../core/services/DiscordService";
import { RollProps } from "../../shared/types";
import {
  availableDice,
  maxDiceSides,
  maxImageDice,
  maxTextDice,
} from "../constants";
import {
  sendDiceResultMessageWithImage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  sendNeedPermissionMessage,
  sendDiceResultMessage,
} from "../messages";
import { getTotalDiceRolled, getHighestDiceSide } from "../../shared/helpers";
import { DatabaseService } from "../../core/services/DatabaseService";

const command = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage: "[dice notation], e.g. 1d20 2d12. Type `/roll` for a detailed explanation",

  async execute({
    message,
    args,
    logOutputChannel,
    interaction,
    title,
    timesToRepeat,
    discord,
  }: RollProps) {
    try {
      if (interaction && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const diceService = DiceService.getInstance();
      const discordService = DiscordService.getInstance();
      const databaseService = DatabaseService.getInstance();

      if (!args.length && interaction) {
        await sendHelperMessage(interaction, logOutputChannel);
        return;
      }

      if (!discordService.checkForAttachPermission(message, interaction)) {
        await sendNeedPermissionMessage(message, logOutputChannel, interaction);
        return;
      }

      const { diceArray, resultArray, shouldHaveImage } = diceService.rollDice(args, availableDice, timesToRepeat);

      if (!diceArray.length && interaction) {
        await sendHelperMessage(interaction, logOutputChannel);
        return;
      }

      const handleOverMaxMessage = async () => {
        await sendDiceOverMaxMessage(message, logOutputChannel, discord, args, interaction, shouldHaveImage);
      };

      if (shouldHaveImage) {
        if (getTotalDiceRolled(diceArray) > maxImageDice) {
          await handleOverMaxMessage();
          return;
        }
        await sendDiceRolledMessage(message, diceArray, interaction);
        const attachmentResult = await diceService.generateDiceAttachment(diceArray);
        if (!attachmentResult) {
          console.error("Failed to generate dice attachment");
          return;
        }
        const { attachment, canvas } = attachmentResult;
        await sendDiceResultMessageWithImage(
          resultArray,
          message,
          attachment,
          canvas,
          logOutputChannel,
          discord,
          interaction,
          title
        );
      } else {
        if (getTotalDiceRolled(diceArray) > maxTextDice || getHighestDiceSide(diceArray) > maxDiceSides) {
          await handleOverMaxMessage();
          return;
        }
        await sendDiceResultMessage(resultArray, message, logOutputChannel, interaction, title);
      }

      await databaseService.updateOnCommand({
        commandName: command.name,
        message,
        interaction
      });

    } catch (error) {
      console.error('Error in roll command:', error);
      const errorResponse = { content: 'There was an error processing your roll!' };

      if (interaction) {
        if (!interaction.replied) {
          await interaction.reply(errorResponse);
        } else {
          await interaction.followUp(errorResponse);
        }
      } else if (message) {
        await message.reply(errorResponse);
      }
    }
  },
};

export default command;