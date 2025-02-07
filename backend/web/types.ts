import { Client } from 'discord.js';
import { ContextVariableMap } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    discord: Client;
  }
}

