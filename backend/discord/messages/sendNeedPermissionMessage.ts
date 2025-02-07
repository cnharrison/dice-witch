import { sendLogEventMessage } from ".";
import { EventType, SendNeedPermissionMessageParams } from "../../shared/types";

const sendNeedPermissionMessage = async ({
  interaction,
}: SendNeedPermissionMessageParams) => {
  const msg = `Looks like I don't have permission to either **attach files** or **embed links** in this channel. I need both of them to show you the dice 😅`;

  try {
    if (interaction) {
      await interaction.followUp(msg);
    }
  } catch (err) {
    console.error("Error sending permission message:", err);
  }

  sendLogEventMessage({
    eventType: EventType.SENT_NEED_PERMISSION_MESSAGE,
    interaction,
  });
};

export default sendNeedPermissionMessage;