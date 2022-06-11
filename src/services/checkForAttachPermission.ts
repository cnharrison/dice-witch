import {
  Message,
  BitField,
  Role,
  PermissionString,
  TextChannel,
  DMChannel,
  NewsChannel,
  Guild,
  GuildMember,
  User,
  ButtonInteraction,
  CommandInteraction,
  PartialDMChannel,
  ThreadChannel,
  TextBasedChannel
} from "discord.js";
const checkForAttachPermission = (
  message: Message,
  interaction?: ButtonInteraction | CommandInteraction
) => {
  const channel:
    | TextChannel
    | DMChannel
    | NewsChannel
    | PartialDMChannel
    | TextBasedChannel
    | ThreadChannel = interaction?.channel

    ? interaction?.channel
    : (message?.channel as TextChannel);
  const guild: Guild = interaction?.guild
    ? interaction?.guild
    : (message?.guild as Guild);
  const me:
    | string
    | Message
    | GuildMember
    | User
    | Role = guild?.me as GuildMember;
  const doesHavePermission: BitField<PermissionString> | null =
    guild &&
    channel?.type === "GUILD_TEXT" &&
    (channel.permissionsFor(me) as any);
    const permissionArray: PermissionString[] | undefined | null =
    doesHavePermission && doesHavePermission?.toArray();
  return channel?.type !== "GUILD_TEXT"
    ? true
    : !!permissionArray?.includes("ATTACH_FILES") &&
        !!permissionArray?.includes("EMBED_LINKS");
};
export default checkForAttachPermission;
