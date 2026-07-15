# Dice Witch roll work

A separate SQLite-backed Durable Object owns one exact roll and delivery record per Discord interaction ID. Keeping this Worker separate prevents notation parsing and PNG rendering from sharing the Gateway heartbeat isolate.

`RollWork.prepare()` is transactional:

- the first request generates and stores one roll seed, one render seed, and the complete JSON-safe outcome;
- identical and concurrent retries return the existing record without rerolling;
- a different payload for the same interaction ID returns an explicit conflict and cannot replace or read the existing record;
- Durable Object recreation preserves the same record.

`RollWork.deliver()`:

- accepts raw notation from the lightweight Gateway and parses it inside the roll isolate;
- stores the interaction token only in the interaction's named Durable Object;
- derives expiry from the Discord interaction Snowflake and the documented 15-minute token lifetime;
- deterministically restores one of the 11 legacy dice-clatter phrases from the persisted render seed;
- edits the deferred response with the clatter before rendering, then retains the same phrase with the final PNG and production-compatible embed;
- records the clatter phase so retries and object recreation do not duplicate it;
- deletes the token immediately after successful delivery or a terminal Discord response;
- retains only a SHA-256 token fingerprint for conflict detection after token deletion;
- honors Discord `Retry-After` and otherwise uses bounded exponential retries through Durable Object alarms;
- deletes the token, fingerprint, delivery metadata, and exact roll record at expiry.

`RollWork.render()` remains available for deterministic verification and returns byte-identical PNG output across retries and object recreation.

The Worker exposes only public `GET /health`; work and delivery are available through the cross-Worker Durable Object binding, not a public HTTP mutation. Tokens are never returned by status/RPC results or written to application logs.

This implementation is local and undeployed. Deployed CPU, memory, latency, and Discord behavior still require authorized development-bot verification.
