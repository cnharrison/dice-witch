# Discord Gateway protocol contracts

Pure `workerd`-compatible contracts for Dice Witch Gateway shard lifecycle and persistence. This package performs no network, storage, timer, Discord REST, or Durable Object I/O and never receives or persists a bot token.

## Source baseline

Retrieved 2026-07-10 from official documentation:

- Discord Gateway lifecycle, heartbeats, Identify, Resume, and disconnect behavior: https://docs.discord.com/developers/events/gateway
- Discord Gateway opcodes and close codes: https://docs.discord.com/developers/topics/opcodes-and-status-codes
- Cloudflare Durable Object WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Durable Object lifecycle: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/

An active outbound Discord WebSocket prevents a Durable Object from hibernating. Gateway capacity planning must therefore measure continuously billable duration rather than applying server-WebSocket hibernation examples to this client connection.

## Lifecycle

`transitionGateway()` is a pure reducer. It accepts a `GatewayMachine` and one typed event, then returns the next machine plus ordered actions for a future Durable Object adapter.

```text
idle
  → connecting
  → awaiting-hello
  → awaiting-identify-permit → identifying → ready
                          ╲
resumable checkpoint      → resuming → ready

connected state → backing-off → connecting
connected state → stopped | fatal
```

Important guarantees:

- Heartbeats begin after Hello and require first-heartbeat jitter.
- Identify cannot be sent before a Coordinator permit.
- Resume does not request or consume an Identify permit.
- Dispatch sequence state is persisted before dispatch is emitted downstream.
- Ready/Resumed state is persisted before readiness is reported.
- A missing Heartbeat ACK terminates the socket and schedules Resume when possible.
- Opcode 1 sends an immediate heartbeat even if the periodic heartbeat is outstanding.
- Opcode 7 preserves resumable session state.
- Invalid Session `false`, close codes 4007/4009, and intentional 1000/1001 closes clear resumable state before Identify.
- Fatal close codes 4004 and 4010–4014 stop automatic reconnects.
- Undocumented close codes fail closed instead of creating an unbounded reconnect loop.

## Persisted checkpoint

`GatewaySessionCheckpoint` is versioned and contains only:

- generation, shard ID, and total shard count;
- Discord session ID, regional Resume URL, and latest sequence;
- last dispatch/heartbeat timestamps;
- checkpoint update timestamp.

Validation rejects partial Resume state, invalid shard coordinates, insecure or non-Discord Resume URLs, unknown fields, and credential-like additions such as a token. Session ID, Resume URL, and sequence must be all present or all null.

The Durable Object adapter in `workers/gateway/` persists a requested checkpoint before executing the following action. Cloudflare output gates help order storage and outbound messages, but the adapter still preserves the reducer's action order explicitly.

## Deliberately out of scope

Task 2.1 does not:

- open a WebSocket;
- build Identify, Resume, heartbeat, or presence payloads containing credentials;
- choose intents;
- implement reconnect timers/backoff;
- create a Durable Object binding or migration;
- deploy to Cloudflare;
- connect any Discord application.

Those runtime concerns are implemented separately in `workers/gateway/` for the authorized development bot and controlled guild. Keeping them outside this package preserves deterministic reducer tests and a credential-free protocol boundary.
