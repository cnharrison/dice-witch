import {
  User,
  CommandInteraction,
  ButtonInteraction,
  Guild,
  GuildMember,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { GuildType, UserType } from "../../shared/types";

type UpdateOnCommandParams = {
  commandName: string;
  interaction?: CommandInteraction | ButtonInteraction;
};

type ClerkUserData = {
  id: string;
  email_addresses: Array<{ email_address: string }>;
};

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private mapGuildToGuildType(guild: Guild): GuildType {
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

  public async upsertGuild(guild: Guild, isARoll: boolean, isActive: boolean = true): Promise<void> {
    const guildData = this.mapGuildToGuildType(guild);

    try {
      await this.prisma.guilds.upsert({
        where: { id: Number(guildData.id) },
        update: {
          name: guildData.name,
          icon: guildData.icon,
          ownerId: Number(guildData.ownerId),
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: Number(guildData.publicUpdatesChannelId),
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: isARoll ? { increment: 1 } : undefined,
          isActive,
        },
        create: {
          id: Number(guildData.id),
          name: guildData.name,
          icon: guildData.icon,
          ownerId: Number(guildData.ownerId),
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: Number(guildData.publicUpdatesChannelId),
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: isARoll ? 1 : 0,
          isActive,
        },
      });
    } catch (err) {
      console.error("Error in upsertGuild:", err);
    }
  }

  private async upsertUser(user: UserType, isARoll: boolean): Promise<void> {
    const { id, username, flags, discriminator, avatar } = user;
    await this.prisma.users.upsert({
      where: { id: Number(id) },
      update: {
        username,
        avatar,
        flags: flags ? flags.bitfield : undefined,
        discriminator: Number(discriminator),
        rollCount: isARoll ? { increment: 1 } : undefined,
      },
      create: {
        id: Number(id),
        username,
        avatar,
        flags: flags ? flags.bitfield : undefined,
        discriminator: Number(discriminator),
        rollCount: isARoll ? 1 : undefined,
      },
    });
  }

  private async upsertUserGuildRelationship(
    guildId: number,
    userId: number,
    isAdmin: boolean = false,
    isDiceWitchAdmin: boolean = false
  ): Promise<void> {
    try {
      const existing = await this.prisma.usersGuilds.findFirst({
        where: {
          AND: [
            { userId: Number(userId) },
            { guildId: Number(guildId) }
          ]
        }
      });

      if (existing) {
        await this.prisma.usersGuilds.update({
          where: { id: existing.id },
          data: {
            isAdmin,
            isDiceWitchAdmin,
            updated_at: new Date()
          }
        });
      } else {
        await this.prisma.usersGuilds.create({
          data: {
            userId: Number(userId),
            guildId: Number(guildId),
            isAdmin,
            isDiceWitchAdmin
          }
        });
      }
    } catch (err) {
      console.error('Error upserting user guild relationship:', err);
    }
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
    const isARoll = ["r", "roll"].includes(commandName);

    try {
      if (interaction) {
        const { user, guild, member } = interaction;
        await this.upsertUser(this.mapUserToUserType(user), isARoll);

        if (guild && member) {
          const guildMember = member as GuildMember;
          const isAdmin = guildMember.permissions.has("Administrator");
          const isDiceWitchAdmin = guildMember.roles.cache.some(role => role.name === "Dice Witch Admin");

          await this.upsertGuild(guild, isARoll);
          await this.upsertUserGuildRelationship(
            Number(guild.id),
            Number(user.id),
            isAdmin,
            isDiceWitchAdmin
          );
        }
      }
    } catch (err) {
      console.error("Error in updateOnCommand:", err);
      throw err;
    }
  }

  public async handleWebLogin(userData: ClerkUserData): Promise<void> {
    try {
      const existingUser = await this.prisma.users.findUnique({
        where: { id: Number(userData.id) }
      });

      if (existingUser) {
        await this.prisma.users.update({
          where: { id: Number(userData.id) },
          data: {
            lastWebLogin: new Date(),
            email: userData.email_addresses[0].email_address
          }
        });
      } else {
        await this.prisma.users.create({
          data: {
            id: Number(userData.id),
            email: userData.email_addresses[0].email_address,
            lastWebLogin: new Date()
          }
        });
      }
    } catch (err) {
      console.error("Error in handleWebLogin:", err);
      throw err;
    }
  }

  public async getMutualGuilds(discordId: string): Promise<any[]> {
    try {
      const mutualGuilds = await this.prisma.usersGuilds.findMany({
        where: {
          userId: Number(discordId)
        },
        include: {
          guilds: true
        }
      });
      return mutualGuilds;
    } catch (err) {
      console.error("Error in getMutualGuilds:", err);
      throw err;
    }
  }

  public async getMutualGuildsWithPermissions(discordId: string) {
    return await this.prisma.usersGuilds.findMany({
      where: { userId: Number(discordId) },
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
          userId: Number(userId),
          guildId: Number(guildId)
        }
      },
      update: {
        isAdmin,
        isDiceWitchAdmin,
        updated_at: new Date()
      },
      create: {
        userId: Number(userId),
        guildId: Number(guildId),
        isAdmin,
        isDiceWitchAdmin
      }
    });
  }

}