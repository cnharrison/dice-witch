import { DiceService } from "../../core/services/DiceService";
import { DiceArray, SendDiceRolledMessageParams } from "../../shared/types";

const sendDiceRolledMessage = async ({
  diceArray,
  interaction,
}: SendDiceRolledMessageParams) => {
  try {
    const numericResults = diceArray.flat().map(die => die.rolled);
    const diceService = DiceService.getInstance();
    const text = diceService.generateDiceRolledMessage(diceArray as DiceArray, numericResults);
    if (interaction?.deferred) {
      await interaction.followUp(text);
    }
  } catch (err) {
    console.error("Error sending dice rolled message:", err);
  }
};

export default sendDiceRolledMessage;