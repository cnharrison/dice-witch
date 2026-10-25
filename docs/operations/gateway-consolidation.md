# Gateway consolidation

**Validation status:** the implementation, local migration tests, and CI pass.
The deployed cold and warm comparisons completed at six and nine sessions per
object with exact event counts and reconciled memory samples for every gateway
object. The nine-session candidate reached about 121 MiB during simultaneous cold
startup; that leaves little observed margin for that burst. The warm candidate
peaked at about 41 MiB in observed samples. Details are recorded in the [evidence](gateway-consolidation-evidence-2026-10-25.json).

Prepare a seven-session canary first; widen to `9+9+7` only after the resource,
delivery, and latency gates below pass. Transfers remain disabled by default.
The [diagnostic findings](gateway-consolidation-platform-support.md) explain the
opening stall, fixture corrections, and delayed analytics. No support case is
needed. No production change has been deployed.

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
The default `--isolate-layout shared` puts all partition objects in one local
gateway isolate. `--isolate-layout separate` reproduces the older per-partition
layout for comparison; it understates the combined transient allocation pressure
when deployed objects share an isolate. Reports record the layout and inspect each
isolate once. Both layouts retain the same 25 shard identities and recovery checks.
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

Every experiment uses unique Worker names and persisted invocation/error logs.
Do not attach `wrangler tail` during load: [Cloudflare documents](https://developers.cloudflare.com/durable-objects/platform/known-issues/)
that enabling a tail requires a software update and advises against tailing heavy
traffic. Earlier synthetic runs received “This script has been upgraded” on live
fixture sockets after tail attachment; account audit logs showed no intervening
code deployment. This is a test-instrumentation confounder, not evidence of a
gateway memory limit. The runner now queries persisted errors without changing
the running scripts, rejects incomplete log responses, and still requires platform
memory samples. Only intentional `/restart` failures are expected.

To isolate synthetic Discord-server resets, `prepareStaging` also accepts
`externalFixtureHostname` (CLI `--external-fixture-hostname`), restricted to an
explicit temporary `trycloudflare.com` host. Start `startLocalFixture` from
`local-fixture.mjs` with that hostname, the same source SHA/deadline/private
synthetic credentials, and a loopback port; point a temporary tunnel at that port.
The original protocol fixture then runs locally while the gateway stays deployed.
The deployed fixture facade authenticates controls and forwards them to that host.
Its data service keeps small SQLite counters on Cloudflare, preserving low-latency
downstream calls and exact totals across resets. Native tests exercise both fixture
placements and recover the counters through a prepared runtime restart.

Record the local fixture bundle hash and tunnel version with the deployed bundle
manifest. Stop gateway load and delete the isolated Workers, dispose the local
fixture runtime, terminate the tunnel, and remove private synthetic credentials in
the experiment's cleanup handler. The local fixture uses no production credentials
or bindings. Tunnel transport adds a separate failure mode and must be recorded;
successful local protocol tests alone still do not establish deployed headroom.

Use `baselineSourceRoot` (`--baseline-source-root`) to compare against a clean
maintained gateway checkout, instead of merely running the feature at capacity six.
Point it at that checkout's `cloudflare` directory. Preparation checks its Git
revision and cleanliness before and after bundling, redirects only the baseline's
gateway source, and retains the same fixture, destination policy and pinned tool
dependencies. `baselineSourceSha`, per-Worker `GATEWAY_SOURCE_SHA`, bundle hashes
and metafiles identify the actual compared implementations. Resource-outcome log
queries run independently of error-level console queries, so missing console
messages do not conceal an exceeded CPU/memory or internal runtime outcome.

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
updates. At the five-partition baseline, a logical lookup removes five partition
RPCs, and a public status read reduces partition RPCs from ten to five (the coordinator
call remains). The account-wide request benefit depends on the frequency of those
operations. A Discord heartbeat does not become a Cloudflare request saving merely
because sessions share an object.

## Expected benefit and limits

October 24 gateway duration was 54,539.62 GB-seconds with 52,256 invocation requests.
Five-to-four and five-to-three residency suggest roughly 20% and 40% duration
reductions respectively **if billing shares/isolate placement remain comparable**.
The latter is approximately 21,816 GB-seconds/day, or about $8/month at the marginal
$12.50/million-GB-second rate before included allowances and invoice rounding.
In the completed cold synthetic comparison, periodic samples inside the matched
loaded-observation windows summed to 115.18 GB-seconds at capacity six and 69.12 at
capacity nine, about 40% lower. Those short, sampled windows are supporting evidence,
not an invoice forecast; phase boundaries and isolate placement affect attribution.
Production projections remain hypotheses, not measured savings. Shared 128-MB isolate billing
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

The full diff's structural review retains seven gating rows for small similarities:
environment-object construction versus an unrelated appearance parser, timer cleanup
owned by separate actors, the coordinator's private promise queue versus another
actor's queue, and synthetic token hashing versus the data service's hash helper.
These are intentionally separate ownership/bundle boundaries. Importing the session
repository solely for token hashing would bring unrelated D1 authentication code into
the fixture. No lint rule was weakened or structural finding blanket-suppressed.

The fleet dispatcher now delegates shard startup to a private helper. New fixture,
runner, and placement code also carries structural size/complexity findings. The
fixture owns the synthetic session lifecycle; the runner keeps its explicit test
phases and cleanup together. Those tradeoffs are visible in review and covered by
protocol, storage, crash, and native-wrapper tests; passing structural metrics alone
would not establish correctness. The evidence JSON also triggers a verbosity finding
for its four measured profiles and historical trials. That is retained provenance
data, not executable control-flow growth. Its per-phase measurements and recovery
groups are kept so reviewers can check the conclusions against the raw artifacts.

## Workload calibration

A read-only query of all 1,440 UTC minutes on October 24 returned 102,276 inbound
and 53,911 outbound gateway WebSocket messages, with sampling interval 1. The busiest
minute had 1,036 inbound messages (17.27/second averaged over that minute). This is
not a sub-second burst bound, and the mix is not exclusively large guild events.

The initial synthetic sustained workload sent 600 full guild payloads/second and
failed at the existing six-session capacity, with a shard disconnection and fixture
reset. Root cause is not established; those runs do not validate a candidate. The
calibrated sustained comparison uses 60 full guild payloads/second, more than three
times that measured busiest-minute rate, while retaining the 24,303-guild cold/warm
startup and 600/second startup burst. Pass `--steady-rate 60` to the
staging runner. This rate applies to slow-service replay and sustained observation;
startup retains the 600-event/second cold burst. Its default 600 remains the separate
stress experiment. The no-tail baseline also lost six sockets during slow-service
replay at 600, so removing the instrumentation confounder alone did not establish
stability. Re-measure production traffic before enabling consolidation; the calibrated test does not
claim that either topology sustains 600 large guild payloads/second.

The source-comparison harness logs each gateway actor activation with its object
and activation IDs. This staging-only diagnostic distinguishes object reconstruction
from transport closure without attaching a live tail. Source provenance is recorded
separately for the maintained baseline and candidate bundles. The six added diagnostic
lines cross the structural class-length threshold; retaining them beside actor
initialization is intentional. The plugin factory and its nested esbuild `setup`
callback are one implementation, not two duplicated implementations. The remaining
churn finding reflects successive harness corrections; no lint rules are suppressed.

## Deployed opening behavior

Nine sessions in one object exposed an invocation-dependent opening stall: the
ninth native WebSocket could remain connecting before Identify. A concurrent-opening
queue alone, serial openings inside one RPC, and holding that RPC open did not fix it.
Admitting batches through separate Durable Object alarm invocations did. The same
behavior occurred with both fixture placements, so the tunnel was not its cause.

A per-partition queue now admits up to six simultaneous openings, following the
[documented waiting-header limit](https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections).
Each batch uses a fresh alarm invocation. Open/error/close/cancellation releases its
slot; established sockets do not occupy slots. Pending work is cancelled when its
session stops or parks. There is no added session-count cap or handshake timeout.
Heartbeats and event processing retain their existing path. Start/recovery recheck
current state after awaited ownership calls so an alarm and explicit start cannot
both start the same connection.

The observed stall is not a documented eight-socket platform limit. The deployed
smoke and full cold comparisons establish that this scheduling change opens and
recovers `9+9+7` under the tested workload. They do not identify an internal
Cloudflare root cause or guarantee headroom for all workloads.
