# Gateway capacity diagnostics: synthetic resets and missing metrics

These are investigation notes, not a support prerequisite. No support message has
been sent or is required from the account owner. The affected resources are isolated synthetic test Workers, with fake
Discord credentials and no production service bindings. Production was unchanged.

## Unresolved observations

1. What caused the fixture object reset at **2026-10-25 16:22:00.280 UTC**?
   Was this a resource limit, infrastructure replacement, or code/runtime update?
2. What caused six outbound sockets on the gateway object below to close together
   at **2026-10-25 16:17:27.429 UTC**, before any intentional crash injection?
3. Why do both Durable Object GraphQL datasets return no rows for these new test
   namespaces while a production namespace returns current data in the same query?
   Is additional configuration or a different query required for isolate memory?

Account: `dfe6c3ddb987a22c7f17955d1973490e`.

## Fixture reset without live tailing

Source: `787ce05e0fd14ec6f32557c3f7212180c2671de9` in
[the feature PR](https://github.com/cnharrison/dice-witch/pull/52).

| Field | Value |
| --- | --- |
| Worker | `dice-witch-gateway-consolidation-fixture-30dbdcb4d616` |
| Version | `82e27def-af59-42ce-9bcc-b45f5cd5a7a4` |
| Namespace | `9b6955a098b04cea87214a6a7ee75b5c` |
| Object | `18ab9fd213bf36750b1245d1cf93d62a1b47ceda45ec1946423725082de64b00` |
| Request ID | `329fe630e565435653898942025851b8` |
| Trace ID | `f41e50b832f7517d429e1f8047933a2a` |
| Profile start | `2026-10-25T16:21:09.006Z` |
| First recorded reset | `2026-10-25T16:22:00.280Z` |

Persisted log message: `Durable Object connection closed because the object was reset.`
The fixture then reports `Fixture restarted during a profile`, which is its explicit
guard against treating lost synthetic server state as a successful test.

The last successful observation had 25 connected shards, all gateway sessions
ready, 25 Identifies, zero Resumes, and all 24,303 lifecycle events applied. The
startup burst sends synthetic guilds with 40 channels at 600 events/second, using
41.25-second heartbeats. No controlled crash/reconnect phase had started.

Each experiment used fresh unique Worker names. No `wrangler tail` was attached.
Persisted logs and invocation logs were enabled at deployment with sampling 1.
The account audit query through 16:22:05 UTC contains no mutation to these test
resources after the profile started. Thus live tail attachment or an operator
redeployment during the profile does not explain this occurrence.

## Six gateway sockets lost during slow-service replay

Source: `37af4be04c1e6f8f06d3d2e31b89724b3adc359e`.

| Field | Value |
| --- | --- |
| Worker | `dice-witch-gateway-consolidation-six-27acac5d3631` |
| Version | `0b527df9-6fdb-4ef8-96d3-4063339d75cb` |
| Namespace | `3a0fe49e1f1a41dbb378480183bd83cf` |
| Object | `f58fda52ea9f4ffa4112d59852f904367d75bc5e31b9f795eb33a8785934688e` |
| Affected shards | 12–17, all six sessions in this partition |
| Peer close time/code | `2026-10-25T16:17:27.429Z`, 1006 |

Startup completed at 16:17:18.212 UTC. During replay at 600 events/second with a
50-ms downstream-service delay, the fixture observed those six sockets closing
together. Subsequent Resume requests were behind the fixture's sent sequence;
the fixture rejects such requests rather than inventing missing replay history.
The captured generic gateway error is `Gateway socket event failed`.

This proves an incomplete test, not a production delivery defect or an OOM.
The slow replay rate is deliberately much higher than the measured busiest
production minute (1,036 inbound messages/minute). A later calibrated run failed
in startup before reaching its 60-event/second slow phase, as described above.

## Missing metrics and evidence limits

The committed [evidence JSON](gateway-consolidation-evidence-2026-10-25.json)
contains the exact GraphQL query, variables, and response under
`platformValidation.positiveControl`. It asks for the five test namespaces plus
production namespace `1a06dbd8204e45dbbfdacf8d3aa58ba3`, in the same time window.
Only production returns rows, including memory samples and invocation counts.
Queries succeeded without GraphQL errors; empty test results are not interpreted
as zero memory use or zero resource errors.

The available persisted error records do not identify an exceeded-memory or
exceeded-CPU outcome. This absence does not establish that no limit was hit.
Local protocol/load tests pass, but local retained heap and allocation profiles
cannot certify deployed isolate-memory headroom. Nine-session capacity remains
unvalidated because baseline-first testing stopped before the candidate ran.

## Reproduction and cleanup

The PR includes the fixture, destination-enforced staging bundle generator, and
runner in `cloudflare/tools/gateway-capacity/`. Prepare from a clean matching
commit using `staging-prepare.mjs`, deploy only its unique synthetic Worker names
with private fake credentials, then run `staging-run.mjs` with `--gateways both`
and `--profile cold`. Use `--steady-rate 60` for calibrated slow/sustained traffic;
the default 600 is the stress case. The setup must retain the expiration,
destination, source-digest, resource-budget, and cleanup guards.

All experiment resources are stopped and deleted after evidence collection; their
IDs above are retained to correlate the recorded diagnostics. Do not run the
test against production names, production Discord credentials, or production
service bindings. Production transfers remain disabled pending validation and
separate release authorization.

## Investigation continues without support

The initial conclusion that these observations required Cloudflare support was
unsupported. The synthetic fixture itself, RPC response lifetimes, queue allocation
pressure, and telemetry attribution remain testable with existing account access.
The native staging-wrapper test now exercises lifecycle writes through its actual
service/DO RPC path. The fixture consumes response bodies before returning plain
text across that boundary. A new deployed comparison is testing that change;
its outcome must not be inferred from the earlier failures.

A full-size local test with all five baseline partition objects sharing one
isolate observed a transient V8 heap estimate of 556 MiB and roughly 5–7 MiB
retained after forced collection. This differs from the earlier harness, which
placed partitions in separate local isolates. It is an allocation-pressure lead,
not proof of deployed OOM or memory headroom. Local and deployed memory evidence
remain distinct. If the synthetic fixture cannot remain stable, run it outside
Durable Objects to isolate the gateway under test.

## Maintained-source cross-check and fixture recovery correction

The host-fixture experiment `4mPQW4` bundled maintained `master` gateway source
`0bfe91e65cacf7920e0dddc9c7c829dd920f03c2` for capacity six, using harness commit
`fe0f11218` (the manifest records its full SHA). It passed startup, slow replay,
controlled reconnect, and controlled object restart: 25 Identifies and exactly 50
expected Resumes. At **17:17:32.584 UTC**, shards 6–11 closed together during
sustained traffic. The partition's constructor logged another activation at
**17:17:33.787 UTC**, and inspection showed restored checkpoints in the idle state.
This establishes an object reconstruction, and disproves the hypothesis that the
feature branch's fetch-based upgrade is required to trigger this observation.
It does not identify the platform's reason for the reconstruction.

The fixture then failed immediately because it attempted to send to the disconnected
shard. Its previous Resume validator also required the exact last-sent sequence.
That omitted Discord's replay behavior and prevented testing recovery from an
unplanned restart during traffic. The fixture now retains compact event descriptors,
continues producing events while disconnected, and replays the unprocessed suffix
before RESUMED. Its fake lifecycle data service deduplicates mutation identities,
as the real service does. Reconnect counts and runtime errors remain visible; this
change does not establish that extra reconnects are acceptable.

New tests cover unsaved in-flight and disconnected dispatch replay, mutation
idempotency, and an actual object abort during slow service writes through both
native staging configurations. The maintained-source trial's three Workers were
stopped and deleted. Subsequent capacity comparisons use the same feature code at
six and nine sessions to measure the placement difference with this corrected fixture.
