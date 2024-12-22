import { DatabaseService } from "../../core/services/DatabaseService";
import { DiceService } from "../../core/services/DiceService";
import { DiscordService } from "../../core/services/DiscordService";
import { getHighestDiceSide, getTotalDiceRolled } from "../../shared/helpers";
import { RollProps } from "../../shared/types";
import {
  availableDice,
  maxDiceSides,
  maxImageDice,
  maxTextDice,
} from "../../core/constants/index";
import {
  sendDiceOverMaxMessage,
  sendDiceResultMessage,
  sendDiceResultMessageWithImage,
  sendDiceRolledMessage,
  sendHelperMessage,
  sendNeedPermissionMessage,
} from "../messages";

const command = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage: "[dice notation], e.g. 1d20 2d12. Type `/roll` for a detailed explanation",

  async execute({
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
        await sendHelperMessage({ interaction, logOutputChannel });
        return;
      }

      if (!discordService.checkForAttachPermission(interaction)) {
        await sendNeedPermissionMessage({ logOutputChannel, interaction });
        return;
      }

      const { diceArray, resultArray, shouldHaveImage } = diceService.rollDice(args, availableDice, timesToRepeat);

      if (!diceArray.length && interaction) {
        await sendHelperMessage({ interaction, logOutputChannel });
        return;
      }

      const totalDiceRolled = getTotalDiceRolled(diceArray);
      const highestDiceSide = getHighestDiceSide(diceArray);
      const isOverMax = (shouldHaveImage && totalDiceRolled > maxImageDice) ||
                        (!shouldHaveImage && (totalDiceRolled > maxTextDice || highestDiceSide > maxDiceSides));

      if (isOverMax) {
        await sendDiceOverMaxMessage({ logOutputChannel, discord, args, interaction, shouldHaveImage });
        return;
      }

      if (shouldHaveImage) {
        await sendDiceRolledMessage({ diceArray, interaction });
        const attachmentResult = await diceService.generateDiceAttachment(diceArray);
        if (!attachmentResult) {
          console.error("Failed to generate dice attachment");
          return;
        }
        const { attachment, canvas } = attachmentResult;
        await sendDiceResultMessageWithImage({
          resultArray,
          attachment,
          canvas,
          logOutputChannel,
          discord,
          interaction,
          title
        });
      } else {
        await sendDiceResultMessage({ resultArray, logOutputChannel, interaction, title });
      }

      await databaseService.updateOnCommand({
        commandName: command.name,
        interaction
      });

    } catch (error) {
      console.error('Error in roll command:', error);
      const errorResponse = { content: 'There was an error processing your roll' };

      if (interaction) {
        if (!interaction.replied) {
          await interaction.reply(errorResponse);
        } else {
          await interaction.followUp(errorResponse);
        }
      }
    }
  },
};

export default command;