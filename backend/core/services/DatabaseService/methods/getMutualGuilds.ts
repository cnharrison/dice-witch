import { DatabaseService } from "..";

export async function getMutualGuilds(
  this: DatabaseService,
  discordId: string
): Promise<any[]> {
  return await this.prisma.usersGuilds.findMany({
    where: { userId: discordId },
    include: { guilds: true }
  });
}