import Discord, {
  Client,
  TextChannel,
  Guild,
  Collection,
  Message,
  EmbedBuilder,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { prefix, botPath, supportServerLink } from "../../config.json";
import { Command, EventType } from "../types";
import { sendLogEventMessage } from "../messages";
import { errorColor } from "../constants/";
import { updateOnCommand } from "../services";

const prisma = new PrismaClient();

export default (discord: Client, logOutputChannel: TextChannel) => {
  try {
    let commands: Collection<string, Command>;
    commands = new Discord.Collection();
    process.chdir(path.dirname(botPath));
    const commandFiles: string[] = fs
      .readdirSync(`${botPath}/build/src/commands`)
      .filter((file: string) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const command = require(`${botPath}/build/src/commands/${file}`);
      commands?.set(command.name, command);
    }

    discord.on("messageCreate", async (message: Message) => {
      if (!message.content.startsWith(prefix) || message.author.bot) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const shiftedArgs = args.shift() as string;
      const commandName = shiftedArgs.toLowerCase();

      const command =
        commands.get(commandName) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
        );

      if (!command) return;

      await updateOnCommand({ prisma, commandName, message });

      try {
        command.execute({ message, args, discord, logOutputChannel, commands });
        sendLogEventMessage({
          eventType: EventType.RECEIVED_COMMAND,
          logOutputChannel,
          message,
          command,
          args,
        });
      } catch (error) {
        const embed: EmbedBuilder = new Discord.EmbedBuilder()
          .setColor(errorColor)
          .setDescription(
            `error 😥 please join my [support server](${supportServerLink}) and report this`
          );
        await message.reply({ embeds: [embed] });
        sendLogEventMessage({
          eventType: EventType.CRITICAL_ERROR,
          logOutputChannel,
          message,
          command,
          args,
        });
      }
    });

    discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isCommand()) return;

      const { commandName } = interaction;

      await updateOnCommand({ prisma, commandName, interaction });

      if (commandName !== "status") {
        try {
          await interaction.deferReply();
        } catch (err) {
          console.error(err);
        }
      }

      const { value: diceNotation } = interaction.options.get("notation") || {};
      const { value: title } = interaction.options.get("title") || {};
      const { value: topic } = interaction.options.get("topic") || {};
      const { value: timesToRepeat } =
        interaction.options.get("timestorepeat") || {};

      const unformattedArgs = topic?.toString().trim().split("-") || [];
      const wasFromSlash =
        !!unformattedArgs.length && unformattedArgs[2] === "slash";
      const args = diceNotation
        ? diceNotation?.toString().trim().split(/ +/)
        : unformattedArgs[1]
        ? [unformattedArgs[1]]
        : [];
      const titleAsString = title?.toString();
      const timesToRepeatAsNumber = Number(timesToRepeat);

      const command =
        commands.get(interaction.commandName) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(interaction.commandName)
        );
      if (command)
        command.execute({
          message: undefined,
          args,
          discord,
          logOutputChannel,
          commands,
          interaction,
          title: titleAsString,
          timesToRepeat: timesToRepeatAsNumber,
          wasFromSlash,
        });
      sendLogEventMessage({
        eventType: EventType.RECEIVED_COMMAND,
        logOutputChannel,
        command,
        args,
        interaction,
      });
    });

    discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isButton()) return;
      await interaction.deferReply();
      const unformattedArgs = interaction.customId.trim().split("-");
      const args = unformattedArgs[1] ? [unformattedArgs[1]] : [];

      const command =
        commands.get(unformattedArgs[0]) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(unformattedArgs[0])
        );

      const wasFromSlash =
        !!unformattedArgs.length && unformattedArgs[2] === "slash";

      if (command)
        command.execute({
          args,
          discord,
          logOutputChannel,
          commands,
          interaction,
          wasFromSlash,
        });
      sendLogEventMessage({
        eventType: EventType.RECEIVED_COMMAND,
        logOutputChannel,
        command,
        args,
        interaction,
      });
    });

    discord.on("guildCreate", async (guild: Guild) => {
      const {
        id,
        name,
        icon,
        ownerId,
        memberCount,
        approximateMemberCount,
        preferredLocale,
        publicUpdatesChannelId,
        joinedTimestamp,
      } = guild;
      try {
        await prisma.guilds.upsert({
          where: {
            id: Number(id),
          },
          update: {
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
          },
          create: {
            id: Number(id),
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: 0,
          },
        });
      } catch (err) {
        console.error(err);
      }
      sendLogEventMessage({
        eventType: EventType.GUILD_ADD,
        logOutputChannel,
        guild,
      });
    });

    discord.on("guildDelete", async (guild: Guild) => {
      const {
        id,
        name,
        icon,
        ownerId,
        memberCount,
        approximateMemberCount,
        preferredLocale,
        publicUpdatesChannelId,
        joinedTimestamp,
      } = guild;
      try {
        await prisma.guilds.upsert({
          where: {
            id: Number(id),
          },
          update: {
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            isActive: false,
          },
          create: {
            id: Number(id),
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: 0,
            isActive: false,
          },
        });
      } catch (err) {
        console.error(err);
      }
      sendLogEventMessage({
        eventType: EventType.GUILD_REMOVE,
        logOutputChannel,
        guild,
      });
    });
  } catch (err) {
    console.error(err);
  }
};
