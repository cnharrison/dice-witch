# Durable storage retirement

The RollWork and LogWork owners retire empty storage with `deleteAlarm()` followed
by `deleteAll()`. Row deletion alone retains billable metadata. Constructors now
inspect existing schema without allocating it for a missing-state read. Existing
schema still receives the existing upgrades; admitted writes initialize schema.

RollWork retains both saved-roll and text-result intents for their existing
90-day lifetime. Active acceptance, saved-roll copying, delivery, accounting,
logging and helper operations prevent retirement. Pending accounting survives
expiry and retries through the existing idempotent accounting owner. Accounting
outages do not prevent independent log handoff or lifecycle synchronization.
Lifecycle receipts still must synchronize before sensitive rows are removed.
Expired provider delivery uses the existing terminalization policy; retirement
does not introduce a provider replay path. The standalone `prepare`/`render`
computation API remains available after retirement; actual delivery admission
still enforces the Discord interaction deadline.

LogWork preserves existing receipt responses, including after admission closes.
A missing receipt can admit an artifact only during the existing source handoff
window, `destinationDeliveredAt + LOG_WORK_RETRY_WINDOW_MS` (six hours), and never
for a future delivery timestamp. Validation and hashing precede the final check.
This fence survives object eviction and storage deletion. The trusted source
owns the artifact timestamp; no new public artifact submission path is added.
A late acceptance completes deferred retirement when it leaves no row.

The binding-only `retireEmptyStorage()` method is deliberately narrower than an
alarm: it never expires or discards a row. It refuses active work, any populated
owned table, any unknown application table (even empty), or any KV entry. The
platform-reserved `_cf_*` tables are inspected through the platform KV API rather
than queried directly. Eligibility and deletion run under the object's input
gate, without remote I/O. Per-object work is bounded by the fixed owned schema,
one existence read per table, and a one-key KV existence read. No namespace scan
runs inside an object.

## Release and legacy cleanup

Nothing in this change executes production cleanup. Merge, deployment and cleanup
require Christopher's release instruction and the existing production workflow.
Do not substitute direct SQL deletion or table dropping for the owner RPC.

1. Deploy and verify the revised Roll Worker through the normal release workflow.
   Verify all active instances have adopted it before maintenance. Exercise the
   maintained Discord actions and a delivered roll on the authorized environment.
2. Enumerate **existing** IDs from one target namespace through Cloudflare's
   list-objects API. Preserve its exact pagination cursor and account/namespace
   identity. Review one page and save a JSON manifest:

   ```json
   { "accountId": "32 lowercase hex characters", "namespaceId": "32 lowercase hex characters", "cursor": "next API cursor or null", "ids": ["64 lowercase hex object ID"] }
   ```

   The six investigation samples are not a cleanup inventory. `hasStoredData`
   does not establish eligibility. Do not generate new IDs or decode opaque IDs
   into guessed Discord identities. Finish each page before enumerating its
   successor. Keep refused IDs in a separate reviewed manifest for a later pass;
   do not continuously revisit them.
3. Materialize a temporary maintenance configuration from
   `wrangler.example.jsonc`. Bind `TARGET` to the deployed RollWork **or** LogWork
   class in that environment. Verify its script/class maps to the manifest's
   namespace in Cloudflare's namespace inventory; the environment labels alone
   cannot prove a binding points at that namespace. Set the exact account and
   namespace variables. Provision a fresh secret as `RETIREMENT_TOKEN` using the
   normal secret channel, and an HTTPS route for the temporary worker. Its checked-in
   configuration has no route, workers.dev, previews, or production resource binding.
   Do not point development at production for convenience.
4. Plan a bounded batch (no network requests, journal writes or secret required):

   ```sh
   node cloudflare/tools/storage-retirement/run.mjs --manifest /secure/page.json --journal /secure/page-receipts.jsonl --budget 20
   ```

   The request budget is an operator-selected rollout size, not a product limit.
   After authorization, use the same command with `--apply --endpoint https://<authorized-maintenance-host>`
   and supply the token through the secret environment. Each object gets one
   sequential request; there is no fan-out, automatic retry or polling. Each
   definitive `retired`/`retained` response is appended to a mode-0600 journal
   pinned to the exact manifest SHA-256. Resume with the same manifest and journal.
   An HTTP failure, malformed result, transport loss or corrupt/truncated journal
   stops the batch. Preserve original evidence; repair only an incomplete final
   journal record before resuming. An uncertain object can be retried safely
   because its owner checks eligibility again. Do not redirect requests to a
   different host or place credentials in command arguments.
5. Verify a small authorized batch with namespace storage metrics and existing-ID
   inspection before increasing the request budget. Count retained/refused objects
   separately. Metrics can lag; avoid tight polling and do not equate a transient
   local SQLite allocation with billed provider bytes. Stop on errors or unexpected
   retained state. Use the preserved cursor for the next separately reviewed page.
6. Remove the temporary worker, route and secret after the run. Retain manifests,
   cursors and journals as operational evidence under the normal access/retention
   policy. There is no permanent maintenance scheduler or additional data resource.

## Evidence and limits

Read-only production evidence collected November 7, 2026 showed November 6 daily
peaks of 34,188,632,000 bytes for RollWork and 9,212,412,000 bytes for LogWork.
The first three lexicographic existing IDs in each namespace had no work/log rows
but retained schema and `hasStoredData: true`. This targeted six-object sample is
not a census. It does **not** establish that all 43.4 GB is reclaimable. Billing
API access returned 403; monetary estimates are not invoice reconciliation.
Original investigation files remain in `/tmp/cw-do-cost-evidence-2026-11-07/`.

On the pinned local workerd/Vitest stack, the real-owner fixtures measured:

| Fixture | Empty/terminal before full deletion | After full deletion |
| --- | ---: | ---: |
| RollWork, normal schema and one prepared record removed | 53,248 bytes | 4,096 bytes |
| LogWork, expired terminal receipt | 12,288 bytes | 4,096 bytes |

Measurements use `SqlStorage.databaseSize` on the same fixture before and after
retirement. Local workerd keeps a database page; these are allocation observations,
not a production billing prediction or latency benchmark. No production load test
was performed. The provider contract for ending billing is documented at
https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/#remove-a-durable-objects-storage.

Verification includes real-owner refusal, duplicate retirement, late acceptance,
eviction/recreation, accounting recovery, retained 90-day actions and schema
migration fixtures. The maintenance runner's controlled transport exercises plan,
budget, resumption, uncertain responses and manifest fencing. The maintenance
HTTP adapter is exercised against a real local namespace with authorization and
target mismatch cases. Provider deployment, namespace binding custody and native
Discord acceptance remain release-time checks. No formal model inventory exists
in this repository; the bounded interleaving test pauses artifact hashing across
expiry and then resumes it, using the actual owner and SQLite implementation.

Original failed verification logs are preserved under `/tmp/retirement-*.log`:
initial LogWork runs queried reserved `_cf_METADATA` and failed `SQLITE_AUTH`;
the first RollWork batch had seven legacy fixture-bootstrap failures; the next
batch exposed a sensitive-cleanup assertion that now needs the recovery alarm to
run after delivery settles. Those failures were fixed without dropping cases.
Independent candidate review additionally found and corrected nested acceptance
scheduling, accounting starvation of logging, and deferred empty-log retirement.

Desktop impact: this repository has no desktop build, Electron/native integration,
sidecar or desktop packaging. No desktop update is applicable. Existing Discord
messages remain the installed surface: action IDs, response contracts and 90-day
intent retention are unchanged, and existing compatibility tests are retained.
The maintainer must verify those actions in the authorized Discord environment
before declaring provider/installed-client acceptance complete.

## Verification history and architecture review

The original failures remain evidence, even after fixes:

- `/tmp/retirement-log-tests-1.log`, `-2.log`, and
  `/tmp/retirement-roll-tests-1.log`: reserved metadata SQL access was refused.
- `/tmp/retirement-work-tests-1.log`: seven fixtures assumed eager schema creation.
- `/tmp/retirement-work-tests-2.log`: expiry inspection preceded deferred cleanup.
- `/tmp/retirement-work-tests-3.log`: a cleanup assertion queried a table now removed
  by full retirement; it now verifies absence of that table.
- `/tmp/retirement-lint-final.log`: the test adapter used a disallowed generic `void`.
- `/tmp/retirement-types-5.log`: test-runtime DurableObject generic environment and
  namespace variance mismatches; fixed with the existing public-method test port
  convention and a union of the two concrete namespace types, without assertions.
- `/tmp/retirement-accounting-tests.log`: the outage fixture needed same-invocation
  service interception, and an expired timestamp of zero was invalid for the
  real alarm API. It now uses a positive expired timestamp and the established
  `runInRollWork` fixture. `/tmp/retirement-accounting-tests-2.log` exposed one
  missing no-schema guard after preparation became lazy; `storedPreparation` now
  returns its existing missing outcome. The third run passed all three cases.

The owner remains the existing Durable Object; no public HTTP change is made to
RollWork. The temporary maintenance transport consumes its exported RPC and has
separate release custody. In-process eligibility computation and local SQLite/KV
storage are tested through the real owner. Owned data services retain their
existing idempotent network protocols; controlled adapters supply fault cases.
Third-party Discord transport and deployed-provider billing remain separate
acceptance evidence. No resource, protocol or dependency migration is introduced.

`ripwire --edit-check` was run separately for both retirement definitions (the
unqualified name was correctly rejected as ambiguous). Its additional
`--quality-delta` advisory reports clone/size heuristics on the large existing
owners and moved private method bodies. These are not configured CI gates, and
are not suppressed here. The scoped exception is owned by RollWork/LogWork:
private wrappers preserve complete async lifetimes, and separate typed readers
retain their own schema/error contracts. A generic storage base or broad class
rewrite would widen this recovery-sensitive change. Real-owner race/recovery
checks are the evidence for this boundary; future consolidation must preserve
those checks and eliminate caller obligations before replacing these owners.
No claim is made that these metrics establish cohesion or adapter fidelity.

Final local verification passed: 523 non-batched Roll tests, 90 batched RollWork
cases, and four parameterized RollWork cases run separately; 94 Interactions
cases; 93 configuration/tool cases; CI lint and all workspace type checks; Roll
and maintenance Worker dry-run bundles. The 19 frontend lint warnings predate
this change. The existing RollWork batch-name parser omits `it.each` cases, so
those four cases remain a manual check until that runner is improved; they were
explicitly run here. Their original no-schema assertion failures remain in
`/tmp/retirement-parameterized-tests.log`, followed by the passing `-2.log` run.
No tests or graders were removed to obtain these results.

## Staging promotion dependency gate

The first GitHub CI run for this change failed its live dependency audit. Staging
promotion requires successful exact-SHA CI, so the follow-up dependency change
updates direct Zod to 4.6.6 and Vite to 8.1.6, and pins patched transitive
brace-expansion 5.0.12, source-map-js 1.2.2 and Undici 6.29.1/7.30.1. Zod's override
uses the root dependency version so the Cloudflare test package's exact pin cannot
retain the vulnerable copy. No audit exceptions or severity thresholds changed.
The existing Sharp 0.35.5 override remains in force.

The affected advisories include
[Zod collection exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) and
[source-map-js indexed-offset denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
The complete original npm report is `/tmp/dice-retirement-audit.json`; original
CI failure is `/tmp/dice-retirement-ci-static-clean.log`. Incremental resolutions
failed to apply exact transitive overrides and one regressed Sharp; those results
were discarded and their failed audits retained as `audit-fixed` through
`audit-fixed-4` logs. A fresh npm 11.6.2 resolution passes the unchanged gate
(`/tmp/dice-retirement-audit-fixed-5.log`) and retains Sharp 0.35.5. This refreshes
transitive packages within the existing manifest ranges, so full suite, build,
type and lint verification is required rather than only retirement tests.

The repository dependency owner can remove the new overrides when each upstream
parent resolves patched versions on a clean install and the same audit and full
verification pass. Do not remove overrides merely because one locally installed
tree is clean. No desktop rebuild applies; Discord action formats and the public
server contracts are unchanged. Staging and production releases remain separate.

The final dependency candidate passed the unchanged live audit gate, the full
`npm test` suite, the four separately selected RollWork parameterized cases,
workspace type checks, CI lint, frontend build/performance budget, Roll Worker
dry run and npm lockfile consistency dry run. The transitive refresh changes
120 existing lockfile paths; its resolved version diff is preserved at
`/tmp/dice-retirement-resolved-dependency-changes.json`. Independent review found
no remaining dependency blockers in this candidate. Deployed acceptance is still
required; local passing results do not bypass exact-SHA CI promotion.

CI on `248fc84` subsequently exposed a fault-fixture race: the platform could
run the immediately scheduled delivery alarm between `stub.acceptDelivery()` and
the test's next invocation that forced expiry. It correctly delivered the roll,
while the expiry test expected a still-pending destination. The quality aggregate
failed because of that Roll failure, not an independent static/build failure.
Original logs remain `/tmp/dice-pr53-roll-ci.clean.log` and
`/tmp/dice-pr53-quality-ci.clean.log`.

The two new accounting fault fixtures now use `runWithPausedAlarms`, which holds
the real Durable Object input gate over fixture setup, explicit alarm execution,
and assertions. This makes a scheduled platform alarm unable to invalidate the
injected initial state. The handlers, SQL storage, recovery assertions and service
faults remain real-owner cases; no assertions, retries or production behavior were
weakened. The original CI failure demonstrates that the configured check rejects
the unprotected interleaving. This helper is deliberately not used by the separate
concurrency tests, where interleaving is the behavior under test. Other legacy
fault fixtures still require review; this is not a repository-wide static rule.
Desktop impact remains not applicable; this follow-up changes tests only.
The corrected fixtures passed both focused cases and the configured
`npm run test:roll --workspace=@dice-witch/cloudflare` entrypoint (523 general
Roll tests plus 90 batched RollWork cases), with Roll type checking and both lint
checks passing. The four unchanged parameterized cases remain separately covered
by the preceding full dependency verification.
