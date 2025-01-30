/*
  Warnings:

  - A unique constraint covering the columns `[user_id,guild_id]` on the table `users_guilds` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "users_guilds_user_id_guild_id_key" ON "users_guilds"("user_id", "guild_id");
