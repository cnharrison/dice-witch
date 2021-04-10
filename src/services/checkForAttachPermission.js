const checkForAttachPermission = (message) =>
  !!message.channel
    .permissionsFor(message.guild.me)
    .toArray()
    .includes("ATTACH_FILES");

module.exports = checkForAttachPermission;
