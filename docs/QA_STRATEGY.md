# QA and E2E review strategy

Established: 2026-10-10. Latest TA-004b evidence: four component tests, 84 Node
contract checks and 25 browser scenarios pass. Browser coverage includes 24
controlled-API UI scenarios and one real browser-to-Express session authorization
fixture. The broader runner/provider integration matrix remains planned work.

## Two separate testing responsibilities

1. **Test Army quality:** verify its UI, API, provider handling, session boundaries,
   runner, and reporting with controlled local fixtures. This suite protects
   changes to the tool and must not depend on a live model or private target.
2. **Target product quality:** execute approved saved/generated suites against an
   explicitly selected product, environment, role, and data set. Its outcomes
   must identify product failures separately from invalid tests or infrastructure.

Mocked UI/backend responses are useful for deterministic frontend checks but are
not full integration evidence. The full local E2E path must include the real
frontend, Express API, browser crawler, Playwright runner, and report renderer,
with only the external model substituted by a deterministic provider fixture.
A separate opt-in live-model benchmark measures generation quality and provider
compatibility. Neither mocked checks nor an LLM review proves product correctness.

## Per-task completion process

1. Specify expected behavior, failure cases, and affected journeys in the task.
2. Implement the smallest complete change; review error handling and cleanup.
3. Run build/lint and relevant unit/API checks. Use tests for decisions, contracts,
   and regressions rather than assertions that simply mirror implementation.
4. Run affected local E2E journeys plus the core smoke suite. Verify both success
   and a deliberate failure to ensure the reporting path is honest.
5. Review browser evidence and user-facing messages. For UI changes, include
   keyboard interaction and representative narrow/wide viewport checks.
6. Record evidence, unresolved defects, and environment limitations; update tasks
   and memory. DONE requires acceptance checks to pass. A blocked required check
   keeps implementation in REVIEW/BLOCKED. Documentation-only tasks use document
   review and identify why no new browser journey applies.

Never weaken an assertion or mark a test skipped solely to turn the run green.
Keep known product defects failed and distinguish flaky retries. E2E reduces risk;
it does not replace unit/API checks, exploratory review, or user acceptance.

## Required regression matrix

| Scenario | Expected result | Initial task |
| --- | --- | --- |
| Load app; fill target; use presets | Correct controls and composed description | TA-001 |
| Review mode | Code is shown and can be edited; no run before Run action | TA-001/002 |
| Valid controlled target through real local backend | Current run has matching test counts and evidence | TA-002/006 |
| One passing and one deliberately failing test | Accurate distinct statuses; never all-pass | TA-002 |
| No discovered tests / syntax error / missing browser | Infrastructure/invalid-suite message with no green result | TA-002 |
| Missing, malformed, or stale report | Current run cannot borrow prior success | TA-002/003 |
| Skipped / timed-out / interrupted test | Explicit status and counts | TA-002 |
| HTTP 400/500, invalid event, stream closes early | Useful error; controls recover; no permanent Working state | TA-002 |
| Concurrent submissions for same/different target | Isolated evidence or clear busy response | TA-003 |
| Cancel, timeout, unreachable page | Terminal state and owned process/browser cleanup | TA-003 |
| Invalid login, expiry, two roles | Correct rejection/refresh; no cross-role session | TA-005 |
| Provider 429, empty models, timeout, bad code | Bounded failure; clear retry action; no execution of invalid output | TA-006/010 |
| Unknown caller, unapproved target, benign sandbox probe | API/worker denies the action and does not expose secrets | TA-004 |
| Save, restart, switch product, rerun | Correct persisted version/environment and auth selection | TA-008 |
| Generate against seeded product defects | Required business failures are detected | TA-010/011 |
| Repair proposal for real regression | Original failure/assertions retained | TA-014 |

## Evidence required

Record task/run ID, commit or working-tree description, command, date, OS/browser,
fixture version, expected/actual result, exit code, and artifact location. For a
failure retain the relevant screenshot/trace/log with secrets and private page
data excluded from shared artifacts. Record counts for passed, failed, skipped,
timed-out and interrupted outcomes, plus infrastructure errors and total tests.

The planned runner must bind every report to its run ID and suite version. A
missing/partial report, nonzero exit, or zero tests cannot be interpreted as
success. Progress messages and console-text regexes are not result evidence.

Suggested automated artifact directory: per-run subdirectories introduced by
TA-003. Retention, redaction, and export policy are part of TA-004/011. Do not
commit auth state, live-provider payloads, private target screenshots, or keys.

## Baseline and immediate commands

Baseline outcomes are documented in `PROJECT_REVIEW.md`. To reproduce only the
current local smoke suite (not generated private-target specs):

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test:contracts
npm.cmd run test:unit
npm.cmd run test:e2e -- --workers=1
```

These commands passed during TA-004b validation in permitted execution.
TA-001 isolated discovery under `tests/app/`. `test:all` selects contract,
component and own-app browser suites; generated target specs remain excluded.
Vite runs on port 5174. UI tests intercept backend requests; the session scenario
uses real local Express authorization routes and stubbed work handlers.
Playwright Chromium revision 1223 was installed during TA-004a. Sandbox process
startup may still require approved execution. See `verification/TA-004b.md` for
current evidence; earlier blocked results are historical.

