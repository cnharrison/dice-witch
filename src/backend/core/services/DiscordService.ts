import {
  Client,
  Message,
  TextChannel,
  ButtonInteraction,
  CommandInteraction,
  ChannelType
} from "discord.js";

type UserCountResult = {
  totalGuilds: number;
  totalMembers: number;
};

export class DiscordService {
  private static instance: DiscordService;

  private constructor() {}

  public static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      DiscordService.instance = new DiscordService();
    }
    return DiscordService.instance;
  }

  public async getUserCount({ discord }: { discord: Client }): Promise<UserCountResult> {
    try {
      const [guildSizes, memberCounts] = await Promise.all([
        discord?.shard?.fetchClientValues("guilds.cache.size"),
        discord?.shard?.broadcastEval((c) =>
          c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
        ),
      ]);

      const totalGuilds = (guildSizes as number[])?.reduce((acc, count) => acc + count, 0) || 0;
      const totalMembers = (memberCounts as number[])?.reduce((acc, count) => acc + count, 0) || 0;

      return { totalGuilds, totalMembers };
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public checkForAttachPermission(
    message: Message,
    interaction?: ButtonInteraction | CommandInteraction
  ): boolean {
    const channel = interaction?.channel ?? (message.channel as TextChannel);
    const guild = interaction?.guild ?? message.guild;
    const me = guild?.members.me;

    if (!guild || !me || channel.type !== ChannelType.GuildText) {
      return true;
    }

    const permissions = channel.permissionsFor(me);
    const permissionArray = permissions?.toArray();

    return permissionArray?.includes("AttachFiles") &&
           permissionArray?.includes("EmbedLinks") ||
           false;
  }
}