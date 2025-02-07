import {
  ButtonInteraction,
  ChannelType,
  Client,
  CommandInteraction,
  GuildMember,
  Message,
  ShardingManager
} from "discord.js";
import { DatabaseService } from "./DatabaseService";
import { PERMISSION_ADMINISTRATOR, ROLE_DICE_WITCH_ADMIN } from "../constants";

type UserCountResult = {
  totalGuilds: number;
  totalMembers: number;
};

export class DiscordService {
  private static instance: DiscordService;
  private client: Client;
  private manager: ShardingManager;
  private handledInteractions = new Set<string>();

  private constructor() {}

  public static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      DiscordService.instance = new DiscordService();
    }
    return DiscordService.instance;
  }

  public setClient(client: Client) {
    this.client = client;
  }

  public setManager(manager: ShardingManager) {
    this.manager = manager;
  }

  public async getUserCount(): Promise<UserCountResult> {
    try {
      const [guildSizes, memberCounts] = await Promise.all([
        this.client?.shard?.fetchClientValues("guilds.cache.size"),
        this.client?.shard?.broadcastEval((c) =>
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
    interaction?: ButtonInteraction | CommandInteraction
  ): boolean {
    const channel = interaction?.channel
    const guild = interaction?.guild
    const me = guild?.members.me;

    if (!guild || !me || channel?.type !== ChannelType.GuildText) {
      return true;
    }

    const permissions = channel.permissionsFor(me);
    const permissionArray = permissions?.toArray();

    return permissionArray?.includes("AttachFiles") &&
           permissionArray?.includes("EmbedLinks") ||
           false;
  }

  public trackInteraction(interactionId: string) {
    this.handledInteractions.add(interactionId);
    setTimeout(() => this.handledInteractions.delete(interactionId), 15_000);
  }

  public checkAndStorePermissions(interaction: CommandInteraction | Message) {
    if (!interaction.guild || !interaction.member || this.handledInteractions.has(interaction.id)) return;

    this.trackInteraction(interaction.id);
    const member = interaction.member as GuildMember;
    const isAdmin = member.permissions.has(PERMISSION_ADMINISTRATOR);
    const isDiceWitchAdmin = member.roles.cache.some(role => role.name === ROLE_DICE_WITCH_ADMIN);

    DatabaseService.getInstance().updateUserGuildPermissions({
      userId: member.id,
      guildId: interaction.guild.id,
      isAdmin,
      isDiceWitchAdmin
    });
  }

  public async getTextChannels(guildId: string) {
    if (!this.manager) {
      console.error('Sharding manager not initialized');
    }

    try {
      const shardId = Number(BigInt(guildId) >> 22n) % this.manager.shards.size;
      const shard = this.manager.shards.get(shardId);

      if (!shard) {
        console.error('Shard not found');
        return Promise.reject('Shard not found');
      }

      const channels = await shard.eval(async (client, { context }) => {
        try {
          if (!client.isReady()) {
            await new Promise<void>(resolve => (client as Client).once('ready', () => resolve()));
          }

          const guild = await client.guilds.fetch(context.guildId);
          if (!guild) {
            return null;
          }

          const channels = await guild.channels.fetch();
          const textChannels = Array.from(channels.values())
            .filter(c => c?.type === 0)
            .map(c => ({
              id: c.id,
              name: c.name
            }));

          return textChannels;
        } catch (error) {
          return null;
        }
      }, { context: { guildId: guildId.toString() } });

      return channels || [];
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public getClient(): Client {
    return this.client;
  }
}