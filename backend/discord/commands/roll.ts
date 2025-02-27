import { DatabaseService } from "../../core/services/DatabaseService";
import { DiceService } from "../../core/services/DiceService";
import { DiscordService } from "../../core/services/DiscordService";
import { getHighestDiceSide, getTotalDiceRolled } from "../../shared/helpers";
import { DiceTypesToDisplay, RollProps } from "../../shared/types";
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
  sendLogEventMessage
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
      if (interaction && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
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

      const firstArg = args[0] || '';
      const match = firstArg.match(/(\d+)d(\d+)/i);
      if (match && interaction) {
        const [_, count, sides] = match;
        const totalDiceRolled = parseInt(count);
        const highestDiceSide = parseInt(sides);
        const shouldHaveImage = availableDice.includes(highestDiceSide as DiceTypesToDisplay);

        const isOverMax = (shouldHaveImage && totalDiceRolled > maxImageDice) ||
                         (!shouldHaveImage && (totalDiceRolled > maxTextDice || highestDiceSide > maxDiceSides));

        if (isOverMax) {
          await sendDiceOverMaxMessage({
            args,
            interaction,
            shouldHaveImage,
          });
          return;
        }
      }

      const diceService = DiceService.getInstance();
      const { diceArray, resultArray, shouldHaveImage, files } = await diceService.rollDice(args, availableDice, timesToRepeat);

      const hasResults = resultArray.length > 0 && resultArray.some(r => r.output);
      
      if (!hasResults && interaction) {
        await sendHelperMessage({ interaction });
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
          interaction,
          title
        });
      } else {
        await sendDiceResultMessage({ resultArray, interaction, title });
      }

      await DatabaseService.getInstance().updateOnCommand({
        commandName: command.name,
        interaction
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