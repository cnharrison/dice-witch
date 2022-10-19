import {
  Message,
  BitField,
  Role,
  PermissionsString,
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
  TextBasedChannel,
  ChannelType,
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
  const me: string | Message | GuildMember | User | Role = guild?.members
    .me as GuildMember;
  const doesHavePermission: BitField<PermissionsString> | null =
    guild &&
    channel?.type === ChannelType.GuildText &&
    (channel.permissionsFor(me) as any);
  const permissionArray: PermissionsString[] | undefined | null =
    doesHavePermission && doesHavePermission?.toArray();
  return channel?.type !== ChannelType.GuildText
    ? true
    : !!permissionArray?.includes("AttachFiles") &&
        !!permissionArray?.includes("EmbedLinks");
};
export default checkForAttachPermission;
