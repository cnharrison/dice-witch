import { DatabaseService } from "..";

export async function getMutualGuildsWithPermissions(
  this: DatabaseService,
  discordId: string
) {
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