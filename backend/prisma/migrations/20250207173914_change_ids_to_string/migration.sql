/*
  Warnings:

  - The primary key for the `guilds` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "users_guilds" DROP CONSTRAINT "users_guilds_guild_id_foreign";

-- DropForeignKey
ALTER TABLE "users_guilds" DROP CONSTRAINT "users_guilds_user_id_foreign";

-- AlterTable
ALTER TABLE "guilds" DROP CONSTRAINT "guilds_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "owner_id" SET DATA TYPE TEXT,
ALTER COLUMN "public_updates_channel_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "guilds_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users_guilds" ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "guild_id" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "users_guilds" ADD CONSTRAINT "users_guilds_guild_id_foreign" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users_guilds" ADD CONSTRAINT "users_guilds_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- RenameIndex
ALTER INDEX "guilds_id_unique" RENAME TO "guilds_id_key";
