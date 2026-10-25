# Gateway consolidation

## Scope and release posture

Placement transfers preserve the active Discord generation, shard IDs/count, bot,
intents, event processing, session ID, sequence, resume URL, and mutation IDs.
They change which GatewayPartition owns one existing session. Production starts
with transfers disabled (`GATEWAY_PLACEMENT_TRANSFERS_ENABLED=false`). The
production values bundle accepts `gatewayPlacementTransfersEnabled: true` to
explicitly enable them. Deploying the code does not initiate a transfer or change
capacity. Future generations retain the configured capacity (currently six).

There are no packaged desktop/native clients in this repository. These changes
are internal to Workers and Discord connections; browser response contracts are
unchanged. No installed desktop update is required.

## Ownership and crash recovery

The coordinator stores per-generation placement overrides and a durable transfer
journal in SQLite. Only one transfer can be active. A transfer parks the source,
drains accepted socket events and channel-directory work, closes the socket, and
exports the processed checkpoint, initial-guild state, and guild inventory. Each
component keeps its existing storage boundary; historical snapshots are loaded
on demand rather than retained in the partition heap.

The target imports without connecting. A synchronous transaction changes ownership,
placement, and journal phase together. The target then activates from that snapshot.
The source remains fenced across eviction and stale fleet-start commands. Completion
requires target READY, ownership, and a fresh acknowledged heartbeat. A transient
coordinator alarm retries interrupted phases; it is removed when no transfer remains.
Repeated begin calls for the active request and phase operations are idempotent.
Stop and reshard operations cannot overlap a transfer.

Before the ownership switch, rollback restores the source snapshot. After the switch,
rollback creates a reverse transfer and exports the target's **latest** processed
checkpoint. It never revives a stale source session. Do not roll back the Worker
binary while custom placement exists: first reverse transfers with this version,
verify the original assignment and healthy sessions, then roll back code.

## Operator procedure (requires separate production release authorization)

Use the existing gateway control Bearer token through a private environment or
secret store. Never put it in evidence artifacts. All routes below are authenticated.

* `GET /gateway/fleet/transfers`: current transfer or null.
* `POST /gateway/fleet/transfers`: begin, with JSON `{generation, shardId,
  shardCount, source, target}`. Source/target are `gateway-partition-N` names.
* `GET /gateway/fleet/transfers/{epoch}`: durable phase/status.
* `POST /gateway/fleet/transfers/{epoch}`: continue/retry.
* `POST /gateway/fleet/transfers/{epoch}/rollback`: restore or reverse.

First inspect current fleet generation, all owners, fresh heartbeat ACKs, inventory,
and Discord session-start budget. The investigated topology was generation 5,
25 shards in `6+6+6+6+1`; do not reuse these coordinates without rechecking.
Record a seven-day baseline including peak traffic, CPU/memory errors, heartbeat
lateness, reconnects, Identify/Resume counts, event latency, delivery/deduplication,
namespace duration, invocations, and billing units where available.

For that topology, canary shard 24 from partition 4 to partition 3. Wait for transfer
completion and the observation gates below; this yields `6+6+6+7`. To reach `9+9+7`,
move shards 18,19,20 from partition 3 to partition 0; 21,22,23 to partition 1; and
24 to partition 2, one completed and observed transfer at a time. This intentionally
uses noncontiguous shard placement. Do not change Discord shard count to compact it.

Reverse the latest transfer on any protocol, delivery, or resource regression.
Reverse all completed transfers in reverse order if returning to original placement.
Disabling the flag prevents new transfers but allows active recovery/rollback.
A completed transfer's reverse is a new transfer, so keep the flag enabled until
rollback is finished. Confirm retired partitions have no connections or recovery
alarms, without disconnecting any required shard.

## Verification and gates

Run gateway tests, configuration/capacity tests, type checks, lint, and the synthetic
live migration runner (`node cloudflare/tools/gateway-capacity/transfer-run.mjs
/absolute/empty/output`). It checks all 25 sessions, canary, reverse transfer,
consolidation, restart, inventories and exact Identify/Resume/event totals. An opt-in
fixture dispatch is queued after the source closes and replayed before RESUMED; it
must apply exactly once through rollback and restart. Mutation scope is restored
before sending Resume so those early dispatches retain their deduplication IDs. DO tests
cover journal/ownership atomicity, stale authority, phase eviction, interrupted
parking, inactive import, and rollback with an advanced target sequence.

The local capacity harness compares six and nine sessions using startup, replay,
slow downstream service, reconnect and restart. Use 24,303 guilds, 40 channels,
600 events/second and 41.25-second heartbeat cadence for the representative run.
Local V8 heap samples are diagnostic only: forced GC/retained heap cannot certify
Cloudflare's 128-MB isolate limit or platform allocation peaks.

The isolated staging harness deploys only synthetic fixture/six/candidate Workers,
with destination enforcement, fake Discord credentials, no production services,
an expiration deadline and cleanup. The fixture checkpoints its drained synthetic
session state immediately before the intentional whole-fleet crash, allowing one
fixture restart in that window. It reports that recovery separately; unexpected
fixture resets still fail. This prevents loss of the test server from being confused
with loss of Discord's session state. Run smoke then full-size cold/warm workloads,
including simultaneous Resume and actor restart. Capture platform memory, CPU,
resource errors, exact event counts, heartbeat and latency evidence. Reject a
candidate with any resource error or missing/duplicated event. Never infer safety
from an incomplete run or missing analytics rows.

Before widening the production canary, require zero missing/duplicate events,
unchanged interaction ACK behavior, no new memory/CPU errors, no additional Identify
outside controlled startup/fallback, no heartbeat timeout, and no reconnect increase
outside the planned transfer. Compare p95/p99 event latency and heartbeat lateness
against matched baseline traffic; any sustained regression blocks widening. Observe
at least one representative peak before each topology step and seven full UTC days
at the final topology. Roll back if the larger failure domain violates recovery SLOs.

Success for costs is a measured reduction in namespace GB-seconds and normalized
internal invocations without a reliability regression. Keep foreground events and
Discord heartbeats unchanged. Request cleanup removes status fanout from logical
routing, avoids repeated status RPCs, unchanged inventory writes, and redundant alarm
updates. A Discord heartbeat does not become a Cloudflare request saving merely
because sessions share an object.

## Expected benefit and limits

October 24 gateway duration was 54,539.62 GB-seconds with 52,256 invocation requests.
Five-to-four and five-to-three residency suggest roughly 20% and 40% duration
reductions respectively **if billing shares/isolate placement remain comparable**.
The latter is approximately 21,816 GB-seconds/day, or about $8/month at the marginal
$12.50/million-GB-second rate before included allowances and invoice rounding.
These are hypotheses, not measured production savings. Shared 128-MB isolate billing
makes object-count scaling non-linear. Request analytics are not invoice request
units. Cloud Witch/Pi's unrelated reduction is excluded.

Consolidation increases shared event-loop contention and the number of shards lost
per object failure. Existing Identify buckets/session-start limits remain centralized;
Resume storms and fresh Identify fallback must both pass load testing. Do not retire
sessions merely because their guild counts are low. Outbound Discord WebSockets
cannot use inbound WebSocket hibernation.

References: [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[Worker memory](https://developers.cloudflare.com/workers/platform/limits/),
[Discord Gateway](https://docs.discord.com/developers/events/gateway).

## Dependency and CI baseline

The feature's CI run exposed existing audit failures. The lockfile pins patched
Zod 4.6.6, Vite 8.1.6, Undici 7.30.1/6.29.1, brace-expansion 5.0.12 and
source-map-js 1.2.2; unrelated package versions are retained. The existing audit
policy is unchanged. Use `npm ci` for reproducible installs. npm 11 has a known
[workspace override reporting/update bug](https://github.com/npm/cli/issues/9514):
`npm ls` can label overridden transitive dependencies invalid, and `npm update`
can restore the vulnerable originals. Verify the lockfile and run `npm run audit:ci`
after dependency changes. Clean `npm ci`, type checks and runtime tests validate
the pinned graph used here.

Local benchmark manifests accept Dagger's explicit `VITE_BUILD_SHA` when Git is
unavailable and record unknown working-tree cleanliness. Staging deployment still
requires a clean Git checkout and matching source and bundle hashes.

## Review notes

The full diff's structural review flags the fleet command dispatcher and several
small code similarities. The dispatcher's extra branches enforce transfer fencing
before asynchronous startup and generation recovery; those checks intentionally
remain beside the commands they guard and have crash/interleaving coverage. Timer
cleanup and environment-object construction matches are structural coincidences
across different owners. The coordinator's short promise queue follows the existing
actor pattern without coupling unrelated actors. Synthetic token hashing stays in
the isolated harness: importing the session repository would bring unrelated D1
authentication code into the fixture bundle. The Identify/Resume test setup shares
state-machine transitions deliberately, while preserving different starting states.
The fixture controller grew to support that explicit checkpoint/recovery lifecycle;
keeping it with the actor that owns the synthetic sessions avoids another storage
owner. These findings are recorded as accepted review tradeoffs, not suppressed lint rules.
