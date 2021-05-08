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
} from "discord.js";
const checkForAttachPermission = (message: Message) => {
  const channel:
    | TextChannel
    | DMChannel
    | NewsChannel = message.channel as TextChannel;
  const guild: Guild = message.guild as Guild;
  const me:
    | string
    | Message
    | GuildMember
    | User
    | Role = guild.me as GuildMember;
  const doesHavePermission: BitField<PermissionString> | null =
    guild && (channel.permissionsFor(me) as BitField<PermissionString> | null);
  const permissionArray:
    | PermissionString[]
    | undefined = doesHavePermission?.toArray();
  return !!permissionArray?.includes("ATTACH_FILES");
};
export default checkForAttachPermission;
