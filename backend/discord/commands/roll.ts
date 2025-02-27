import { RollService } from "../../core/services/RollService";
import { DiscordService } from "../../core/services/DiscordService";
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

      const rollService = RollService.getInstance();
      const firstArg = args[0] || '';
      const { isOverMax, shouldHaveImage } = rollService.checkDiceLimits(firstArg);

      if (isOverMax && interaction) {
        await sendDiceOverMaxMessage({
          args,
          interaction,
          shouldHaveImage,
        });
        return;
      }

      const rollResult = await rollService.rollDice({
        notation: args,
        timesToRepeat,
        title,
        interaction,
        source: 'discord'
      });

      const { diceArray, resultArray, shouldHaveImage: resultHasImage, files } = rollResult;

      const hasResults = resultArray.length > 0 && resultArray.some(r => r.output);

      if (!hasResults && interaction) {
        await sendHelperMessage({ interaction });
        return;
      }

      if (resultHasImage) {
        await sendDiceRolledMessage({ diceArray, interaction });

        const diceService = await import("../../core/services/DiceService").then(mod => mod.DiceService.getInstance());
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

    } catch (error) {
      console.error('Error in roll command:', error);
      if (interaction?.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "Something went wrong with your dice roll. Please try again.", ephemeral: true });
      }
    }
  },
};

export default command;