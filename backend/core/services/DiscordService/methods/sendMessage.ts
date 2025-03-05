import { DiscordService } from "..";

export async function sendMessage(
  this: DiscordService,
  channelId: string, 
  messageOptions: any
): Promise<any> {
  if (!this.manager) {
    return false;
  }

  try {
    const shardId = Number(BigInt(channelId) >> 22n) % this.manager.shards.size;
    const shard = this.manager.shards.get(shardId);

    if (!shard) {
      return false;
    }

    let serializedMessageOptions;
    try {
      if (messageOptions.files?.length) {
        messageOptions.files.forEach((file: any, index: number) => {
          if (file.attachment && !Buffer.isBuffer(file.attachment)) {
            console.error(`File attachment at index ${index} is not a Buffer. Type:`, typeof file.attachment);
            if (typeof file.attachment === 'string') {
              messageOptions.files[index].attachment = Buffer.from(file.attachment);
            } else if (Array.isArray(file.attachment)) {
              messageOptions.files[index].attachment = Buffer.from(file.attachment);
            }
          }
        });
      }

      serializedMessageOptions = {
        content: messageOptions.content,
        embeds: messageOptions.embeds,
        files: messageOptions.files?.length ? messageOptions.files.map((file: any) => {
          return {
            name: file.name,
            data: file.data ? Buffer.from(file.data).toString('base64') : null,
            attachment: file.attachment && Buffer.isBuffer(file.attachment)
              ? file.attachment.toString('base64')
              : null
          };
        }) : [],
        reply: messageOptions.reply
      };
    } catch (error) {
      console.error("Error serializing message options:", error);
      serializedMessageOptions = {
        content: messageOptions.content,
        embeds: messageOptions.embeds,
        files: [],
        reply: messageOptions.reply
      };
    }

    const result = await shard.eval(async (client, { context }) => {
      try {
        const channel = await client.channels.fetch(context.channelId);

        if (!channel) {
          return { success: false };
        }

        if (!channel.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
          return { success: false };
        }

        const deserializedOptions: any = {
          content: context.messageOptions.content,
          embeds: context.messageOptions.embeds,
          files: context.messageOptions.files?.length ? context.messageOptions.files.map((file: any) => {
            return {
              name: file.name,
              attachment: file.attachment ? Buffer.from(file.attachment, 'base64') : null,
              data: file.data ? Buffer.from(file.data, 'base64') : null
            };
          }) : []
        };

        if (context.messageOptions.reply) {
          deserializedOptions.reply = {
            messageReference: context.messageOptions.reply.messageReference
          };
        }

        const sentMessage = await channel.send(deserializedOptions);
        return {
          success: true,
          messageId: sentMessage.id,
          channelId: sentMessage.channelId
        };
      } catch (error: any) {
        console.error('Error sending message to Discord channel:', error);
        if (error?.code === 50013 || error?.code === 160002 ||
            (error?.message && (
              error.message.includes("Missing Permissions") ||
              error.message.includes("Missing Access") ||
              error.message.includes("Cannot reply without permission") ||
              error.message.includes("read message history")
            ))) {
          return {
            success: false,
            error: "PERMISSION_ERROR",
            message: "Cannot reply without permission to read message history",
            code: error.code || 50013
          };
        }
        return { success: false };
      }
    }, { context: { channelId, messageOptions: serializedMessageOptions } });

    return result;
  } catch (error: any) {
    console.error('Error in sendMessage:', error);
    
    if (error?.code === 50013 || error?.code === 160002 ||
        (error?.message && (
          error.message.includes("Missing Permissions") ||
          error.message.includes("Missing Access") ||
          error.message.includes("Cannot reply without permission") ||
          error.message.includes("read message history")
        ))) {
      return {
        success: false,
        error: "PERMISSION_ERROR",
        message: "Cannot reply without permission to read message history",
        code: error.code || 50013
      };
    }
    
    if (error?.code === 429 || 
        (error?.message && (
          error.message.includes("rate limit") || 
          error.message.includes("You are being rate limited") ||
          error.message.toLowerCase().includes("ratelimit")
        ))) {
        
      if (typeof this.client !== 'undefined' && this.client.shard && typeof process.send === 'function') {
        process.send({
          type: 'error',
          errorType: 'DISCORD_RATE_LIMIT',
          message: error?.message || String(error),
          stack: error?.stack,
          shardId: this.client.shard?.ids[0],
          timestamp: Date.now(),
          context: {
            code: error?.code || 429,
            method: error?.method,
            path: error?.path,
            limit: error?.limit,
            timeout: error?.timeout,
            route: error?.route,
            channelId: channelId,
            global: error?.global
          }
        });
      }
      
      return {
        success: false,
        error: "RATE_LIMIT",
        message: "Discord rate limit exceeded",
        code: error.code || 429,
        details: {
          timeout: error.timeout,
          limit: error.limit,
          route: error.route,
          global: error.global
        }
      };
    }
    
    return { success: false };
  }
}