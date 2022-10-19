-- CreateTable
CREATE TABLE "guilds" (
    "id" BIGINT NOT NULL,
    "name" VARCHAR(255),
    "icon" VARCHAR(255),
    "owner_id" BIGINT,
    "member_count" INTEGER,
    "approximate_member_count" INTEGER,
    "preferred_locale" VARCHAR(255),
    "public_updates_channel_id" BIGINT,
    "joined_timestamp" BIGINT,
    "roll_count" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN DEFAULT true,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stats" (
    "id" SERIAL NOT NULL,
    "rolls" INTEGER,
    "dice" INTEGER,
    "users" INTEGER,
    "total_count" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGINT NOT NULL,
    "username" VARCHAR(255),
    "flags" INTEGER,
    "discriminator" INTEGER,
    "avatar" VARCHAR(255),
    "roll_count" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_guilds" (
    "id" SERIAL NOT NULL,
    "user_id" BIGINT,
    "guild_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_guilds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guilds_id_unique" ON "guilds"("id");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_unique" ON "users"("id");

-- AddForeignKey
ALTER TABLE "users_guilds" ADD CONSTRAINT "users_guilds_guild_id_foreign" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users_guilds" ADD CONSTRAINT "users_guilds_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
