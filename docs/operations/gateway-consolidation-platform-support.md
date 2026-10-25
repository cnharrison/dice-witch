# Gateway capacity diagnostic findings

No support case was opened or is required. The earlier support prerequisite was an
incorrect conclusion from incomplete tests and delayed telemetry. These findings
come from source inspection, synthetic deployed experiments, persisted logs, and
account GraphQL queries. All experiments use fake Discord credentials and isolated
Workers; none changes production.

## Connection opening stall: fixed and tested

At nine sessions per object, the ninth native WebSocket could remain connecting
before sending Identify. Both a direct Cloudflare fixture and an external fixture
reproduced it. Limiting simultaneous openings, serializing openings within one RPC,
and holding that RPC open did not resolve it. Opening through separate invocations
did. This is an observed invocation-dependent behavior, not an established platform
limit of eight sockets.

The partition now schedules opening batches through fresh Durable Object alarm
invocations. Its queue allows six simultaneous openings, matching Cloudflare's
[documented waiting-header limit](https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections).
Open, error, close, and cancellation release slots; established sessions do not
occupy slots. There is no new session cap or handshake timeout. Stop and transfer
parking cancel pending openings. A second fix rechecks connection state after an
awaited ownership call, preventing explicit start and alarm recovery from both
starting the same connection.

A deployed `9+9+7` smoke test passed with 25 Identifies, 50 Resumes, 240 lifecycle
events, and no fixture errors. The final-source full cold comparison also completed
startup, slow downstream writes, reconnect, object restart, sustained traffic, and
quiet observation. See the [evidence record](gateway-consolidation-evidence-2026-10-25.json)
for tested revisions, workloads, counters, and resource observations.

## Recovery tests initially modeled Discord incorrectly

The synthetic server originally rejected Resume when the checkpoint lagged its
last sent sequence. It also failed as soon as traffic reached a disconnected shard.
That omitted Discord's replay behavior and prevented testing ordinary recovery.
It now retains compact event descriptors, continues producing during a disconnect,
and replays the unprocessed suffix before RESUMED. Its lifecycle service deduplicates
mutation IDs, as the real service does. Tests cover in-flight and disconnected
replay, exact mutation counts, and an actual object abort during slow service writes.

The production connection restores its mutation scope before sending Resume, so
replayed dispatches arriving before RESUMED keep their original deduplication IDs.
The live migration test exercises that order through transfer, rollback, and restart.

Some object reconstructions still have no exposed internal cause. A maintained-source
trial at `0bfe91e65cacf7920e0dddc9c7c829dd920f03c2` lost shards 6–11 together at
17:17:32.584 UTC; the actor logged a new activation at 17:17:33.787 UTC. Thus the
feature's transport changes were not required to produce a reconstruction. The
final cold baseline also resumed six sessions after an unplanned reconstruction;
the candidate needed only its 50 controlled Resumes. Both finished with exact
application event counts and 25 Identifies. In the completed warm comparison, the
baseline recovered six sessions after about 20.1 seconds (48 buffered events each),
and the candidate recovered nine sessions after about 2.1–2.3 seconds during startup.
Both again retained exact counts and 25 Identifies. This demonstrates the larger
failure domain; a short experiment does not estimate long-term reset rates.
Unknown internal reset causes do not
prevent testing recovery, and they are not proof of memory exhaustion.

## Missing metrics: delayed, not zero

Early successful GraphQL queries returned no test namespace rows even while a
production namespace returned data in the same query. Later queries returned
namespace/object memory and duration samples. No configuration change or support
intervention was needed for those samples to appear. Empty responses remain
incomplete evidence, never zero usage or zero errors.

The final cold comparison has stable repeated samples covering all five baseline
and all three candidate objects, including each loaded and quiet observation phase.
The runner compares rows in canonical dimension order because equal timestamps
have no stable ordering. A broader query exposed quiet-window rows while the original
fixed-window query still omitted them; the original query later caught up. Collection
now queries through the current time and filters results back to the completed
report interval. An independent real-API check verified complete coverage and stable
repeated samples with that query. Missing coverage and CPU/memory-limit errors
remain failures.
[Periodic memory samples](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/)
measure the whole isolate and are not an absolute peak guarantee.

The largest observed candidate sample across polling queries was 127,197,184 bytes
(about 121.3 MiB), during simultaneous cold startup. The reconciled query's maximum
was 127,123,556 bytes. Later loaded/quiet samples were much lower. Reporting only
local retained heap or steady-state memory would hide the burst. The cold candidate
also took about 125 seconds to finish startup versus 97 seconds for the baseline;
these are phase completion times, not event-latency percentiles.

The fixture advertises Identify concurrency 25. The last recorded production budget
had concurrency 1; the real centralized Identify permit gate remains unchanged.
That difference helps interpret the simultaneous startup stress but does not waive
resource gates. Start with the seven-session canary and measure actual peak behavior
before widening. Synthetic results do not certify unrestricted nine-session headroom.

## Test infrastructure confounders

Attaching a live tail can update a running script, as described in
[Cloudflare's known issues](https://developers.cloudflare.com/durable-objects/platform/known-issues/).
Earlier experiments observed script-upgraded socket errors after tail attachment.
Subsequent comparisons use persisted logs and constructor activation records without
attaching a live tail. Intentional `/restart` aborts are identified separately;
other error outcomes remain failures.

A no-tail direct fixture also reset at 16:22:00.280 UTC, with no intervening test
resource mutation in account audit logs. That occurrence's internal cause remains
unknown. Moving the synthetic server to the host isolated the gateway from fixture
object resets and allowed the full cold comparison to finish. Two warm attempts
then failed when their temporary tunnel returned HTTP 502/530. Those are incomplete
runs, not successful capacity results. All their Workers were deleted. The subsequent
warm comparison completed both capacities using the direct Cloudflare fixture,
removing the tunnel dependency.

Historical failed trials and their source revisions remain in the evidence JSON.
They are not counted as successful validation, and correcting the replay model does
not excuse increased reconnects or missed/duplicated events.

## Release decision

The implementation supports resumable, fenced placement transfers with an explicit
rollback path. Deploying it does not consolidate sessions: transfers default off
and future generations retain capacity six. Follow the
[operator procedure and production gates](gateway-consolidation.md), including a
seven-session canary, peak observation, and matched latency/reliability measurements
before further transfers. Reverse placements before rolling back the binary.

The cost hypothesis is approximately 20% duration reduction for five-to-four objects
or 40% for five-to-three when billing shares are comparable. Production billing and
reliability measurements remain the decision criteria; local heap samples and a
support response would not replace them.
