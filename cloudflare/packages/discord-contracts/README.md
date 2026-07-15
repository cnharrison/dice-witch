# Dice Witch Discord contracts

Worker-safe parsing and HTTP request construction for raw Discord interactions. This package does not import Discord.js and performs no network or storage I/O.

## Roll input

`parseRollInteraction()` validates the application, optional guild scope, command type, interaction token, channel, invoking user, username, and the exact `/roll` option set. It returns bounded raw notation plus explicit title and repetition values. Parser-backed notation grouping occurs later in the separate roll isolate so the Gateway bundle stays small and heartbeat-focused.

Malformed repetition values are rejected rather than silently treated as one roll. This corrects the current fallback behavior and requires user approval before a user-visible deployment.

## Responses

The response builders cover Discord's documented interaction lifecycle:

- type-5 deferred channel responses, including the immutable initial ephemeral flag;
- editing the original interaction response;
- public or ephemeral followup messages;
- multipart PNG attachments using `payload_json`, `attachments[0]`, and `files[0]`;
- `attachment://filename` embed references;
- mention suppression on every message;
- production-compatible result embeds and explicit invalid/over-limit messages.

Interaction IDs, application IDs, tokens, message sizes, embed sizes, filenames, media types, attachment descriptions, and the default 10 MiB upload ceiling are validated before a `Request` is created. This package performs no storage. The downstream `RollWork` object now retains an approved interaction token only until delivery or the interaction's 15-minute expiry; it never logs or returns the token.

Sources retrieved 2026-07-10:

- https://docs.discord.com/developers/interactions/receiving-and-responding
- https://docs.discord.com/developers/reference#uploading-files

The local Gateway now defers valid `/roll` interactions and invokes the cross-Worker `RollWork` Durable Object. This path remains undeployed pending separate development-deployment authorization.
