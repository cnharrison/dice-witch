import {
  User,
  CommandInteraction,
  ButtonInteraction,
  Guild,
  GuildMember,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { GuildType, UserType } from "../../shared/types";
import { PERMISSION_ADMINISTRATOR, ROLE_DICE_WITCH_ADMIN } from "../constants";

type UpdateOnCommandParams = {
  commandName: string;
  interaction?: CommandInteraction | ButtonInteraction;
};

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private readonly processedInteractions: Set<string>;
  private prisma: PrismaClient;
  private cleanupInteractionsInterval: NodeJS.Timeout;

  private constructor() {
    this.prisma = new PrismaClient();
    this.processedInteractions = new Set<string>();
    
    this.cleanupInteractionsInterval = setInterval(() => this.cleanupOldInteractions(), 10 * 60 * 1000);
    if (this.cleanupInteractionsInterval.unref) {
      this.cleanupInteractionsInterval.unref();
    }
  }
  
  public async destroy() {
    if (this.cleanupInteractionsInterval) {
      clearInterval(this.cleanupInteractionsInterval);
    }
    
    this.processedInteractions.clear();
    
    await this.prisma.$disconnect();
  }
  
  private cleanupOldInteractions() {
    if (this.processedInteractions.size > 250) {
      const toRemove = Array.from(this.processedInteractions).slice(0, this.processedInteractions.size - 250);
      toRemove.forEach(id => this.processedInteractions.delete(id));
    }
  }


  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public mapGuildToGuildType(guild: Guild): GuildType {
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      approximateMemberCount: guild.approximateMemberCount ?? undefined,
      preferredLocale: guild.preferredLocale,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ?? undefined,
      joinedTimestamp: guild.joinedTimestamp,
    };
  }

  public async updateGuild(guildData: GuildType, isARoll = false, isActive = true) {
    const guildId = guildData.id;
    const ownerId = guildData.ownerId;
    const updateChannelId = guildData.publicUpdatesChannelId

    await this.prisma.$transaction(async (tx) => {
      await tx.guilds.upsert({
        where: { id: guildId },
        update: {
          name: guildData.name,
          icon: guildData.icon,
          ownerId,
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: updateChannelId,
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: isARoll ? { increment: 1 } : undefined,
          isActive,
        },
        create: {
          id: guildId,
          name: guildData.name,
          icon: guildData.icon,
          ownerId,
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: updateChannelId,
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: isARoll ? 1 : 0,
          isActive,
        },
      });
    });
  }

  private mapUserToUserType(user: User): UserType {
    return {
      id: user.id,
      username: user.username,
      flags: user.flags ? { bitfield: user.flags.bitfield } : undefined,
      discriminator: user.discriminator,
      avatar: user.avatar ?? undefined,
    };
  }

  public async updateOnCommand({ commandName, interaction }: UpdateOnCommandParams): Promise<void> {
    if (!interaction) return;
    if (this.processedInteractions.has(interaction.id)) return;

    const { user, guild, member } = interaction;
    if (!guild?.id) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        const userId = user.id;
        const guildId = guild.id;

        const guildData = this.mapGuildToGuildType(guild);
        await tx.guilds.upsert({
          where: { id: guildId },
          update: {
            name: guildData.name,
            icon: guildData.icon,
            ownerId: guildData.ownerId,
            memberCount: guildData.memberCount,
            approximateMemberCount: guildData.approximateMemberCount,
            preferredLocale: guildData.preferredLocale,
            publicUpdatesChannelId: guildData.publicUpdatesChannelId,
            joinedTimestamp: guildData.joinedTimestamp,
            rollCount: ["r", "roll"].includes(commandName) ? { increment: 1 } : undefined,
            isActive: true,
          },
          create: {
            id: guildId,
            name: guildData.name,
            icon: guildData.icon,
            ownerId: guildData.ownerId,
            memberCount: guildData.memberCount,
            approximateMemberCount: guildData.approximateMemberCount,
            preferredLocale: guildData.preferredLocale,
            publicUpdatesChannelId: guildData.publicUpdatesChannelId,
            joinedTimestamp: guildData.joinedTimestamp,
            rollCount: ["r", "roll"].includes(commandName) ? 1 : 0,
            isActive: true,
          },
        });

        const userData = this.mapUserToUserType(user);
        await tx.users.upsert({
          where: { id: userId },
          update: {
            username: userData.username,
            avatar: userData.avatar,
            flags: userData.flags ? userData.flags.bitfield : undefined,
            discriminator: userData.discriminator,
            rollCount: ["r", "roll"].includes(commandName) ? { increment: 1 } : undefined,
          },
          create: {
            id: userId,
            username: userData.username,
            avatar: userData.avatar,
            flags: userData.flags ? userData.flags.bitfield : undefined,
            discriminator: userData.discriminator,
            rollCount: ["r", "roll"].includes(commandName) ? 1 : 0,
          },
        });

        if (member) {
          const guildMember = member as GuildMember;
          const isAdmin = guildMember.permissions.has(PERMISSION_ADMINISTRATOR);
          const isDiceWitchAdmin = guildMember.roles.cache.some(role => role.name === ROLE_DICE_WITCH_ADMIN);

          await tx.usersGuilds.upsert({
            where: {
              userId_guildId: {
                userId,
                guildId
              }
            },
            update: {
              isAdmin,
              isDiceWitchAdmin,
              updated_at: new Date()
            },
            create: {
              userId,
              guildId,
              isAdmin,
              isDiceWitchAdmin
            }
          });
        }
      });

      this.processedInteractions.add(interaction.id);
    } catch (err) {
      console.error("Error updating on command:", err);
    }
  }

  public async getMutualGuilds(discordId: string): Promise<any[]> {
    return await this.prisma.usersGuilds.findMany({
      where: { userId: discordId },
      include: { guilds: true }
    });
  }

  public async getMutualGuildsWithPermissions(discordId: string) {
    const userId = discordId;
    const guilds = await this.prisma.usersGuilds.findMany({
      where: { userId },
      select: {
        isAdmin: true,
        isDiceWitchAdmin: true,
        guilds: {
          select: {
            id: true,
            name: true,
            icon: true
          }
        }
      }
    });

    return guilds.map(guild => ({
      ...guild,
      guilds: guild.guilds ? {
        ...guild.guilds,
        id: guild.guilds.id.toString()
      } : null
    }));
  }

  public async getGuildSettings(guildId: string): Promise<{
    skipDiceDelay: boolean;
  }> {
    try {
      const guild = await this.prisma.guilds.findUnique({
        where: { id: guildId }
      });

      return {
        skipDiceDelay: guild?.skipDiceDelay ?? false
      };
    } catch (error) {
      console.error("Error retrieving guild settings:", error);
      return {
        skipDiceDelay: false
      };
    }
  }

  public async updateGuildPreferences(guildId: string, preferences: {
    skipDiceDelay?: boolean;
  }): Promise<void> {
    try {
      await this.prisma.guilds.update({
        where: { id: guildId },
        data: {
          skipDiceDelay: preferences.skipDiceDelay
        }
      });
    } catch (error) {
      console.error("Error updating guild preferences:", error);
      throw error;
    }
  }

  async updateUserGuildPermissions({
    userId,
    guildId,
    isAdmin,
    isDiceWitchAdmin
  }: {
    userId: string;
    guildId: string;
    isAdmin: boolean;
    isDiceWitchAdmin: boolean;
  }) {
    await this.prisma.usersGuilds.upsert({
      where: {
        userId_guildId: {
          userId,
          guildId
        }
      },
      update: {
        isAdmin,
        isDiceWitchAdmin,
        updated_at: new Date()
      },
      create: {
        userId,
        guildId,
        isAdmin,
        isDiceWitchAdmin
      }
    });
  }
}