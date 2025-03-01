-- AlterTable
ALTER TABLE "users_guilds" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDiceWitchAdmin" BOOLEAN NOT NULL DEFAULT false;
