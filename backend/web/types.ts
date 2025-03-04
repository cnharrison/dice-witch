import { Client } from 'discord.js';

declare module 'hono' {
  interface ContextVariableMap {
    discord: Client;
  }
}

