const { logEvent } = require("../services");

const sendNeedPermissionMessage = (message, logOutputChannel) => {
  message.channel.send(
    `doesn't look like i have permission to **attach files** in this channel. i need them to show you the dice 😅`
  );
  logEvent("sentNeedPermissionsMessage", logOutputChannel, message);
};

module.exports = sendNeedPermissionMessage;
