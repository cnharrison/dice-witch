import { DatabaseService } from "..";

export async function updateUserGuildPermissions(
  this: DatabaseService,
  {
    userId,
    guildId,
    isAdmin,
    isDiceWitchAdmin
  }: {
    userId: string;
    guildId: string;
    isAdmin: boolean;
    isDiceWitchAdmin: boolean;
  }
) {
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