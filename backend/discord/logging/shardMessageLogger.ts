import type { Shard } from 'discord.js';

interface BaseMessage {
  type: string;
  timestamp?: number;
}

interface InteractionMessage extends BaseMessage {
  type: 'interaction_received';
  interactionId: string;
  commandName: string;
  userId: string;
  guildId?: string;
}

interface StatusCommandMessage extends BaseMessage {
  type: 'status_command_start' | 'status_getting_data' | 'status_requesting_shards' | 'status_shards_timeout' | 'status_sending_response' | 'status_response_sent';
  interactionId: string;
  userId?: string;
  guildId?: string;
  requestId?: string;
}

interface RollCommandMessage extends BaseMessage {
  type: 'roll_command_start' | 'roll_processing_dice' | 'roll_dice_processed' | 'roll_generating_image' | 'roll_image_generated' | 'roll_sending_result' | 'roll_result_sent';
  interactionId: string;
  userId?: string;
  guildId?: string;
  dice?: string;
  resultCount?: number;
  diceCount?: number;
}

interface CommandDeferMessage extends BaseMessage {
  type: 'command_defer_start' | 'command_defer_success';
  interactionId: string;
  commandName?: string;
}

interface ErrorMessage extends BaseMessage {
  type: 'error';
  shardId?: number;
  errorType?: string;
  message?: string;
  stack?: string;
  context?: {
    commandName?: string;
    args?: any;
    user?: { username?: string; tag?: string; id?: string };
    guild?: { name?: string; id?: string };
    userId?: string;
    guildId?: string;
    isTimeout?: boolean;
    route?: string;
    limit?: number;
    timeout?: number;
    global?: boolean;
    path?: string;
    [key: string]: any;
  };
}

interface ShardStatusRequestMessage extends BaseMessage {
  type: 'shardStatusRequest';
  requestId: string;
}

export type ShardMessage =
  | InteractionMessage
  | StatusCommandMessage
  | RollCommandMessage
  | CommandDeferMessage
  | ErrorMessage
  | ShardStatusRequestMessage
  | BaseMessage;

const handleInteractionReceived = (message: InteractionMessage) => {
  const timestamp = new Date(message.timestamp || Date.now()).toISOString();
  console.log(`[INTERACTION] [${timestamp}] Received interaction ${message.interactionId} for command /${message.commandName} from user ${message.userId} in guild ${message.guildId || 'DM'}`);
};

const handleStatusCommand = (message: StatusCommandMessage) => {
  const timestamp = new Date(message.timestamp || Date.now()).toISOString();

  switch (message.type) {
    case 'status_command_start':
      console.log(`[STATUS_COMMAND] [${timestamp}] Status command started for interaction ${message.interactionId} from user ${message.userId} in guild ${message.guildId || 'DM'}`);
      break;
    case 'status_getting_data':
      console.log(`[STATUS_COMMAND] [${timestamp}] Getting user/guild data for interaction ${message.interactionId}`);
      break;
    case 'status_requesting_shards':
      console.log(`[STATUS_COMMAND] [${timestamp}] Requesting shard status for interaction ${message.interactionId}, requestId: ${message.requestId}`);
      break;
    case 'status_shards_timeout':
      console.log(`[STATUS_COMMAND] [${timestamp}] ⚠️ Shard status request timed out for interaction ${message.interactionId}, requestId: ${message.requestId}`);
      break;
    case 'status_sending_response':
      console.log(`[STATUS_COMMAND] [${timestamp}] Preparing to send response for interaction ${message.interactionId}`);
      break;
    case 'status_response_sent':
      console.log(`[STATUS_COMMAND] [${timestamp}] ✅ Response successfully sent for interaction ${message.interactionId}`);
      break;
  }
};

const handleRollCommand = (message: RollCommandMessage) => {
  const timestamp = new Date(message.timestamp || Date.now()).toISOString();

  switch (message.type) {
    case 'roll_command_start':
      console.log(`[ROLL_COMMAND] [${timestamp}] Roll command started for interaction ${message.interactionId} from user ${message.userId} in guild ${message.guildId || 'DM'} - Dice: ${message.dice}`);
      break;
    case 'roll_processing_dice':
      console.log(`[ROLL_COMMAND] [${timestamp}] Processing dice for interaction ${message.interactionId} - Dice: ${message.dice}`);
      break;
    case 'roll_dice_processed':
      console.log(`[ROLL_COMMAND] [${timestamp}] Dice processed for interaction ${message.interactionId} - Results: ${message.resultCount}`);
      break;
    case 'roll_generating_image':
      console.log(`[ROLL_COMMAND] [${timestamp}] Generating dice image for interaction ${message.interactionId} - Dice count: ${message.diceCount}`);
      break;
    case 'roll_image_generated':
      console.log(`[ROLL_COMMAND] [${timestamp}] Dice image generated for interaction ${message.interactionId}`);
      break;
    case 'roll_sending_result':
      console.log(`[ROLL_COMMAND] [${timestamp}] Sending dice result for interaction ${message.interactionId}`);
      break;
    case 'roll_result_sent':
      console.log(`[ROLL_COMMAND] [${timestamp}] ✅ Dice result successfully sent for interaction ${message.interactionId}`);
      break;
  }
};

const handleCommandDefer = (message: CommandDeferMessage) => {
  const timestamp = new Date(message.timestamp || Date.now()).toISOString();

  switch (message.type) {
    case 'command_defer_start':
      console.log(`[DEFER] [${timestamp}] Deferring reply for /${message.commandName} interaction ${message.interactionId}`);
      break;
    case 'command_defer_success':
      console.log(`[DEFER] [${timestamp}] ✅ Successfully deferred reply for interaction ${message.interactionId}`);
      break;
  }
};

const handleError = (message: ErrorMessage, shardId: number) => {
  const timestamp = new Date(message.timestamp || Date.now()).toISOString();
  const shardIdStr = `Shard ${message.shardId || shardId}`;
  const errorType = message.errorType || 'UNKNOWN_ERROR';

  console.error(`\n[ERROR] [${timestamp}] [${shardIdStr}] [${errorType}]`);

  if (message.message) {
    console.error(`Message: ${message.message}`);
  }

  if (message.context) {
    if (message.context.commandName) {
      console.error(`Command: ${message.context.commandName}`);
    }

    if (message.context.args) {
      console.error(`Args: ${JSON.stringify(message.context.args)}`);
    }

    if (message.context.user) {
      const user = message.context.user;
      console.error(`User: ${user.username || user.tag || 'Unknown'} (${user.id || 'Unknown ID'})`);
    } else if (message.context.userId) {
      console.error(`User ID: ${message.context.userId}`);
    }

    if (message.context.guild) {
      const guild = message.context.guild;
      console.error(`Guild: ${guild.name || 'Unknown'} (${guild.id || 'Unknown ID'})`);
    } else if (message.context.guildId) {
      console.error(`Guild ID: ${message.context.guildId}`);
    }

    const otherContextProps = { ...message.context };
    delete otherContextProps.user;
    delete otherContextProps.guild;
    delete otherContextProps.userId;
    delete otherContextProps.guildId;
    delete otherContextProps.commandName;
    delete otherContextProps.args;

    if (message.context.isTimeout) {
      console.error(`INTERACTION TIMEOUT DETECTED: ${message.context.isTimeout}`);
    }

    if (message.errorType === 'DISCORD_RATE_LIMIT') {
      console.error(`DISCORD RATE LIMIT DETECTED:
Route: ${message.context.route || 'unknown'}
Limit: ${message.context.limit || 'unknown'}
Timeout: ${message.context.timeout || 'unknown'}ms
Global: ${message.context.global || false}
Path: ${message.context.path || 'unknown'}`);
    }

    if (Object.keys(otherContextProps).length > 0) {
      console.error(`Additional Context: ${JSON.stringify(otherContextProps)}`);
    }
  }

  if (message.stack) {
    console.error(`\nStack Trace:`);
    console.error(message.stack);
  }

  console.error('\n---');
};

const handleShardStatusRequest = async (message: ShardStatusRequestMessage, shard: Shard, getShardStatusCallback: (requestId: string) => Promise<void>) => {
  console.log(`[Manager] Received shard status request from Shard ${shard.id}, request ID: ${message.requestId}`);
  await getShardStatusCallback(message.requestId);
};

export const handleShardMessage = async (
  message: any,
  shard: Shard,
  shardStatusCallback: (requestId: string) => Promise<void>
): Promise<void> => {
  if (!message || typeof message !== 'object') return;

  const messageType = message.type;
  if (!messageType) return;

  try {
    switch (messageType) {
      case 'interaction_received':
        handleInteractionReceived(message as InteractionMessage);
        break;

      case 'status_command_start':
      case 'status_getting_data':
      case 'status_requesting_shards':
      case 'status_shards_timeout':
      case 'status_sending_response':
      case 'status_response_sent':
        handleStatusCommand(message as StatusCommandMessage);
        break;

      case 'roll_command_start':
      case 'roll_processing_dice':
      case 'roll_dice_processed':
      case 'roll_generating_image':
      case 'roll_image_generated':
      case 'roll_sending_result':
      case 'roll_result_sent':
        handleRollCommand(message as RollCommandMessage);
        break;

      case 'command_defer_start':
      case 'command_defer_success':
        handleCommandDefer(message as CommandDeferMessage);
        break;

      case 'error':
        handleError(message as ErrorMessage, shard.id);
        break;

      case 'shardStatusRequest':
        await handleShardStatusRequest(message as ShardStatusRequestMessage, shard, shardStatusCallback);
        break;

      default:
        console.log(`[Unhandled Message Type] ${messageType}:`, message);
    }
  } catch (error) {
    console.error(`[Message Handler Error] Failed to handle message of type ${messageType}:`, error);
  }
};