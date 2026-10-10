# Task tracker

Updated: 2026-10-10. Owner for implementation/review: assistant during active work;
user supplies product expectations and real-target access when needed.

Current: **TA-004a and TA-004b DONE; TA-004 remains IN PROGRESS**. Next task:
TA-004c worker isolation, destination restrictions and provider-data minimization.
TA-001 runtime checks now pass (see 2026-10-10 TA-004a handoff). The user explicitly requested the
next tasks, authorizing TA-002/003 implementation before that verification completes.
User-directed current item: **TA-016**, GitHub Pages project site with screenshot
and project details, in progress ahead of TA-004c.

## Working rules

States: BACKLOG -> READY -> IN PROGRESS -> REVIEW -> DONE. BLOCKED records a
specific obstacle, responsible party, and action needed to resume. Dependencies
that have not started are normal sequencing, not unexpected blockers.

Work on one implementation task at a time. Split larger rows into checked task
cards before coding. Track completed acceptance checks (for example 2/5), not an
unsupported percentage. At handoff record what changed, evidence, blockers,
remaining work, and the exact next action. Update project memory at the same time.

Effort ranges below are rough active engineering days for one developer, including
review; they are not elapsed-time promises. Actual dates are set when a task
starts. Provider access and the blocked browser environment can change estimates.

## Ordered backlog

| Task | Outcome | Priority | State | When / prerequisites | Rough effort |
| --- | --- | --- | --- | --- | --- |
| TA-000 | Code review, research, baseline, tracker, memory | P1 | DONE | 2026-10-10 | Completed this session |
| TA-001 | Build/lint pass; meaningful own-app unit and E2E suite | P1 | DONE | Runtime gates passed during TA-004a verification, 2026-10-10 | Completed |
| TA-002 | Honest structured results and resilient stream handling | P0 | REVIEW | Browser suite passes; real runner integration still pending | 2-3 days |
| TA-003 | Isolated run files, bounded execution, cancellation, cleanup | P1 | REVIEW | Browser suite passes; real process cleanup and visual review pending | 2-4 days |
| TA-004 | Restricted execution and local API access boundary | P0 | IN PROGRESS | TA-004a/b completed 2026-10-10; TA-004c worker boundaries next | 3-5 days |
| TA-005 | Verified login and separate role/environment sessions | P1 | BACKLOG | After TA-003/004 | 2-3 days |
| TA-006 | Provider health, timeouts, clear failures, settings | P1 | BACKLOG | After TA-002/004 | 1-2 days |
| TA-007 | GitHub CI for Test Army with retained failure evidence | P1 | BACKLOG | After TA-001/002; initial workflow can precede later tasks | 1-2 days |
| TA-008 | Saved products/environments/suites/history and guided UI | P2 | BACKLOG | After TA-003/005/006/007 | 3-5 days |
| TA-009 | Bounded exploration and recorded workflows | P2 | BACKLOG | After TA-004/008 | 3-5 days |
| TA-010 | Reviewable scenarios, expected outcomes, validated generation | P1 | BACKLOG | After TA-009 | 3-5 days |
| TA-011 | Generator benchmark and reproducible defect reports | P2 | BACKLOG | After TA-002/008/010 | 2-4 days |
| TA-012 | API checks and reusable controlled data setup | P2 | BACKLOG | After TA-008/010/011 | 2-4 days |
| TA-013 | Accessibility, visual, and browser/device coverage | P2 | BACKLOG | After TA-008/010/011 | 3-5 days |
| TA-014 | Reviewed repair suggestions with regression protection | P2 | BACKLOG | After TA-010/011 | 3-5 days |
| TA-015 | Target-product CI execution, schedules, release summaries | P2 | BACKLOG | After TA-004/007/008/011; confirm target runner access | 2-4 days |
| TA-016 | GitHub Pages project site, app screenshot and project details | P2 | REVIEW | Local page/checks pass; verify deployment after push | 0.5-1 day |

TA-007 should be pulled forward immediately after TA-002 if GitHub runner access
is available. All other rows follow the stated prerequisite order. Later rows
are roadmap-sized items to split at kickoff, not commitments to implement every
feature in a single session.

## Milestones and review points

- M1: TA-001 through TA-007. Dependable local execution and CI. Review after
  TA-002 (truthful results) and again after the security/session/provider work.
- M2: TA-008 through TA-011. Reusable product setup and reviewed, measurable
  generation. Review with three distinct controlled web-product fixtures.
- M3: TA-012 through TA-015. Broader testing and build integration. Prioritize the
  next item using M2 user feedback; no calendar dates committed yet.

## Task acceptance checks

### TA-001 — Restore the baseline

- Latest 2026-10-10 update: DONE, 5/5 checks now satisfied. Build/lint pass,
  4 component tests pass, 22 isolated own-app browser tests pass after approved
  execution and Chromium installation. Finish: 2026-10-10. Earlier blocked
  evidence below is historical; see [TA-004a verification](verification/TA-004a.md).

- State: BLOCKED (runtime verification). Progress: 2/5 acceptance checks completed:
  lint passes and default E2E discovery includes only own-app tests (initially
  four; expanded in TA-002).
- Scope: correct TypeScript test configuration and unused import; replace starter
  assertions; separate own-app specs from generated target tests; include useful
  backend JavaScript linting as appropriate; document startup prerequisites.
- Done when: (1) build passes, (2) lint passes, (3) meaningful unit tests pass,
  (4) browser checks cover Test Army controls, presets, and review-mode behavior,
  (5) default own-app E2E discovery never includes private/generated tests.
- E2E: run local home and workflow tests; use controlled API events for frontend
  behavior. Record that mocked API responses do not prove the real backend works.
- Completed: corrected test configuration typing; replaced starter unit/browser
  assertions; associated UI labels; isolated app specs and test server; extended
  type checking to E2E; enabled backend linting and corrected its terminal escape
  cleanup; documented prerequisites and commands.
- Evidence: [TA-001 verification](verification/TA-001.md). TypeScript and lint
  pass; discovery lists four own-app tests. Full build, unit and browser checks
  remain blocked by `spawn EPERM`.
- Blocker: B01 now also blocks Vite bundling after the TypeScript stage passes.
- Next action: run build/lint/test:all in a permitted browser-capable environment,
  address any observed runtime failures, and close only after all gates pass.
- Actual start / finish: 2026-10-10 / not finished.

### TA-002 — Results that can be trusted

- Latest 2026-10-10 update: REVIEW. Browser scenarios now pass; real runner
  integration remains pending. B01 no longer prevents these test commands.
  Earlier blocked entries below are historical.

- State: BLOCKED (browser verification). Started/implemented: 2026-10-10.
- Progress: 4/5 checks have contract evidence: structured outcomes, current-run
  report identity, resilient stream handling and regression tests. Browser review
  remains blocked by B01. This is not an end-to-end completion claim.

- Scope: typed terminal state and per-test status, runner exit/signal information,
  current-run report validation, HTTP/stream error handling.
- Done when: successful, failed, skipped, timed-out, canceled, no-tests, and
  infrastructure-error cases are distinct; no missing report or process error
  can show green; abrupt stream termination returns actionable UI feedback.
- E2E: known pass/fail specs, syntax error, missing report/browser, empty suite,
  malformed event, JSON error response, truncated stream, and stale report fixture.
- Completed: typed/validated summary, UUID report identity, explicit runner
  outcome/counts/errors, resilient streaming with request deadline, direct UI
  error messages, 37 passing Node contract tests and 17 discoverable browser tests.
- Evidence: [TA-002 verification](verification/TA-002.md). TypeScript/lint pass;
  Vite build, component-unit execution and browser execution remain blocked.
- Remaining: execute/review browser scenarios and real local runner integration
  in a permitted environment. Next implementation area is TA-003 resource ownership.

### TA-003 — Own every run's resources

- Latest 2026-10-10 update: REVIEW. The 22-test browser suite now passes.
  Real process cleanup and manual visual review remain unverified; previous
  B01 entries below are historical. Do not infer real lifecycle evidence from
  controlled browser responses or fake process tests.

- State: BLOCKED (runtime verification). Actual start/implementation: 2026-10-10.
- User explicitly requested the next task and easier, smoother UI. Scope includes
  responsive layout, readable controls, cancellation feedback and accessible login
  controls; saved products/history in TA-008 remain backlog.
- Scope: run IDs, isolated code/auth/report/artifact paths, one active run first,
  bounded process execution, browser cleanup, cancellation, retention.
- Done when: duplicate/simultaneous requests cannot mix results; cancellation and
  timeout stop owned child processes; navigation failures close browsers; stale
  artifacts cannot enter a new report. Preserve Windows process-tree behavior.
- E2E: two concurrent submissions, identical URLs, cancel while running, timeout,
  invalid navigation, and rerun after failure; inspect process/artifact cleanup.
- Completed: UUID job folders for code/auth/report/artifacts; single active task
  across preview/generate/run; per-task browser ownership; provider abort signal;
  two-minute runner and four-minute task deadlines; explicit cancellation and
  disconnect cleanup; direct local runner spawning; Windows process-tree kill;
  session deletion at finish; seven-day folder retention on next task start.
- UI: cancel/cleanup feedback, preview/execution interlock, guided empty/setup
  states, improved contrast/focus, mobile layout, reduced motion, contained log
  scrolling, readable wrapping test titles and accessible login fields.
- Progress: 3/5 review gates have evidence: (1) isolation/admission/retention
  contracts, (2) lifecycle/report/stream contracts with fake owned processes and
  browsers, (3) TypeScript/lint and 21-test browser discovery. (4) real Windows
  process/browser cleanup and (5) browser/visual workflow review remain blocked.
  Contract evidence does not establish OS process termination or full E2E success.
- Evidence: [TA-003 verification](verification/TA-003.md); 50 Node contracts PASS.
- Blocker: B01, `spawn EPERM` prevents browser execution and Vite bundling.
- Next: run the verification checklist in a permitted browser-capable terminal;
  retain evidence and resolve observed failures before closing TA-003. Next
  implementation is TA-004 execution/API boundaries; no calendar date committed.

### TA-004 — Restrict execution and access

- 2026-10-10 next-card kickoff/handoff: **TA-004b DONE**, session authorization.
  Scope: short-lived in-memory browser sessions, authenticated API requests,
  session-owned cancellation/artifacts, safe screenshot delivery, and readable
  expiry/restart recovery. Keep tokens out of URLs, persistent browser storage,
  logs, generated code and provider inputs.
- TA-004b acceptance (recorded before implementation): (1) absent/invalid/expired
  credentials cannot reach work handlers; (2) a second session cannot cancel or
  read the first session's jobs; (3) owner screenshots load with safe file scope;
  (4) UI establishes/reuses a session and handles expiry without replaying work;
  (5) contract, build/lint and controlled browser journeys pass.
- Progress: **5/5** TA-004b checks satisfied. Actual start/finish: 2026-10-10.
  Completed API bearer authorization, owner cancellation/artifacts, in-memory
  client transport, authorized blob screenshots and expiry/restart recovery.
  Build/lint PASS; 84 contract checks, 4 component tests, 25 browser scenarios
  PASS, including real browser-to-Express session/CORS/ownership coverage.
  Evidence: [TA-004b verification](verification/TA-004b.md). Blockers: none for
  this card. No commit/push/PR created.
- TA-004c remains next: isolated worker, secret-free execution environment,
  enforced approved destinations/redirects and provider-data minimization.
  Browser sessions do not authenticate Windows users; approved local UI origins
  may establish their own sessions. Hostile local programs remain out of scope
  for this card. TA-004 overall cannot close until worker boundaries pass.

- 2026-10-10 kickoff/handoff: split into sequential cards. **TA-004a DONE**:
  loopback listener, exact browser Origin/Host checks, required custom request
  header, bounded JSON and typed input validation before resource admission.
  Acceptance: approved UI requests work; unknown/missing/null origins and rebound
  hosts fail; malformed/oversized requests fail before work; UI errors remain
  readable; local HTTP regression and affected browser journeys reviewed.
- Progress: 5/5 card checks satisfied. Build/lint, 4 component tests, 73 contract
  checks and 22 browser scenarios PASS. Actual start/finish: 2026-10-10.
- TA-004b session authorization is complete. TA-004c remaining: isolated worker
  with secret-free environment and enforced destination/redirect policy, plus
  minimized provider data. TA-004a/b do not provide authentication against local
  programs or a generated-code sandbox.

- Scope: loopback default, explicit UI origins, request/session authorization,
  request validation, secret-free runner environment, restricted worker design,
  scoped target hosts including approved intranet hosts, data minimization.
- Done when: an unrelated origin/request cannot run code; generated code cannot
  read host secrets/write outside its sandbox; unapproved destinations and
  redirects are rejected. A static code allowlist alone does not satisfy this.
- E2E: benign boundary probes against controlled fixtures, allowed intranet-like
  host fixture, rejected redirect, sanitized provider payload, and readable error.
- Completed: TA-004a loopback binding, exact browser origins/Host, custom header,
  bounded JSON, typed request validation and frontend transport updates.
  Evidence: [TA-004a verification](verification/TA-004a.md).
- Next: TA-004c restricted worker design/implementation with Windows
  prerequisites recorded; shared deployment stays outside this milestone.

### TA-016 — GitHub Pages project site

- State: REVIEW. User clarified this means a public GitHub Pages website,
  not an About screen inside the product, 2026-10-10.
- Scope: static project page deployed from `docs/`, real clean-workspace screenshot,
  project workflow, accurate provider/data and security limits, technology details,
  README link, and GitHub Actions Pages deployment.
- Acceptance: (1) responsive static site opens with relative assets; (2) screenshot
  is an actual local app capture without user data; (3) product/provider/data
  descriptions are accurate; (4) deployment workflow has least required permissions
  and triggers on project-site changes; (5) HTML/link review and build are clean.
- E2E applicability: static documentation site; review rendered page at desktop
  and narrow viewport and check asset links. No app/backend/provider calls apply.
- Completed: responsive static site in `docs/` with app screenshot, workflow,
  technology, provider data flow, security limits and roadmap. Added Pages
  workflow, local static server/browser check, screenshot capture and README link.
- Validation: site browser review passes desktop/mobile; app build/lint pass.
- Remaining: push site/workflow and confirm Pages deployment and public URL.

### TA-005 — Authentication that proves success

- Scope: explicit success condition, per-product/environment/role sessions,
  expiry/relogin, selectable login locators and a manual-login fallback.
- Done when: invalid credentials never save a successful session; roles cannot
  share auth accidentally; expired sessions show a clear reconnect action.
- E2E: good/bad login, expiry, role switch, and manual authenticated-state reuse
  on a local fixture. Do not automate real MFA/SSO without supplied target setup.
- Completed work: none. Next: define supported auth contracts after TA-004.

### TA-006 — Provider and service readiness

- Scope: health endpoint, provider-specific startup, explicit model choice,
  timeouts/cancel, bounded retry, useful error mapping, shared provider interface.
- Done when: server starts without waiting indefinitely for model discovery;
  missing keys, empty model list, rate limits, invalid output and outage are
  distinguishable; CLI and UI provider behavior is documented or consolidated.
- E2E: deterministic provider stub for success/429/timeout/empty/invalid output;
  real provider smoke is separate and opt-in because it sends data/costs tokens.
- Completed work: none. Next: define health and provider errors after TA-004.

### TA-007 — Protect changes with CI

- Scope: install from lockfile, build, lint, unit/API checks, controlled local
  browser E2E, failure artifacts, and pull-request result reporting.
- Done when: clean checkout passes; deliberate failure fails the job; artifacts
  remain available; private IPs/provider credentials are unnecessary for CI.
- E2E: same own-app suite locally and in GitHub Actions. Branch protection is
  configured only where repository access/permissions actually allow it.
- Completed work: none. Next: workflow after TA-001/002; verify GitHub access then.

### TA-008 — Reuse setup and results

- Scope: persistent products, environment/role profiles, suite versions, run
  history, configurable API URL, guided setup, real labels and responsive layout.
- Done when: restarting preserves non-secret metadata and selected suites; users
  can run saved tests without AI; switching products does not retain the wrong
  target/auth; fresh installation guides users through prerequisites.
- E2E: create two products, save/edit/rerun, reload/restart, inspect history,
  keyboard navigation, narrow/wide viewport. Review secret storage separately.
- Completed work: none. Next: choose minimal persistence and data model at kickoff.

### TA-009 — Learn a workflow from evidence

- Scope: bounded same-product exploration and user-recorded flows, stable
  locators, page states, iframe/custom-widget adapters, coverage limitations.
- Done when: captures a multi-page workflow and its prerequisites, respects
  configured scope/budgets, exposes unsupported widgets, avoids unintended writes.
- E2E: conventional form, SPA table/search, iframe/upload fixture, and rejected
  out-of-scope link. Only expand the capability matrix after a passing fixture.
- Completed work: none. Next: pick three controlled product fixtures.

### TA-010 — Generate from explicit expectations

- Scope: structured scenario plan before code, requirement links, fixture data,
  locator evidence, syntax/type validation and bounded dry-run feedback.
- Done when: unknown business rules are flagged; no invented valid credentials;
  no blanket sleeps; each scenario states expected behavior; review preserves
  changes and reruns the approved version; invalid output does not execute.
- E2E: plan -> edit -> generate -> review -> execute, plus missing test data,
  unsupported selector, truncated output and deterministic known-defect cases.
- Completed work: none. Next: scenario schema and fixture-backed acceptance set.

### TA-011 — Measure quality and explain failures

- Scope: versioned evaluation fixtures with known-good/known-bad variants, report
  history, requirement links, traces/screenshots/console, exportable defect draft.
- Done when: same code/prompt/model/data version is identifiable; seeded defects
  are detected; bad tests versus product failures versus environment errors are
  distinguishable; evaluation sample size and uncertainty are reported.
- E2E: known defect -> linked evidence -> export -> rerun fixed fixture; redact
  sensitive data. A defect draft remains a draft until explicitly sent elsewhere.
- Completed work: none. Next: define benchmark metrics and stable fixture versions.

### TA-012 — Add API checks and data fixtures

- Scope: API scenarios, schema/contract assertions, setup/teardown and isolated
  data references usable by browser suites.
- Done when: UI and API steps share intended test data; cleanup runs on failure;
  negative authorization and validation cases have explicit expectations.
- E2E: API creates test object -> browser verifies it -> cleanup removes it,
  including a deliberately failing midway step.
- Completed work: none. Next: choose the first controlled API contract.

### TA-013 — Broaden coverage deliberately

- Scope: accessibility checks with manual review, approved visual baselines,
  Chromium/Firefox/WebKit and selected mobile viewport profiles.
- Done when: visual diffs require explicit review; accessibility limitations are
  visible; browser/profile is included in result identity and reproduction data.
- E2E: known visual/accessibility defects and keyboard workflow across selected
  browser profiles. Viewport emulation does not claim native mobile coverage.
- Completed work: none. Next: select supported browser/profile matrix.

### TA-014 — Repair without hiding defects

- Scope: evidence-backed locator/wait repair proposals, diff preview, original
  expected-result preservation, budgeted attempts and reruns.
- Done when: selector-only fixture change is repaired after review; a real
  product regression remains failed; original assertions/version are retained.
- E2E: changed locator versus removed functionality, rejected patch, exhausted
  budget and rollback. No automatic assertion deletion or silent skips.
- Completed work: none. Next: use TA-011 benchmark to define repair boundaries.

### TA-015 — Connect to target builds

- Scope: headless saved-suite invocation, CI result export, schedules, build IDs,
  artifact retention and release summary. Separate from Test Army's own CI.
- Done when: a target build can select an approved suite; unavailable targets
  report infrastructure failure; scheduled runs preserve per-run isolation.
- E2E: local target build -> smoke suite -> correct pipeline exit/report, then
  duplicate schedule/cancel/unreachable target scenarios.
- Completed work: none. Next: confirm where a runner can reach the user's target
  environment; GitHub-hosted runners may not reach an internal network.

## Blocker register

| ID | Status | Affects | Evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| B01 | RESOLVED for current checks | Previously blocked build/unit/browser checks | Approved execution outside sandbox passed build/lint/unit; installed missing Chromium, then 22 browser tests passed on 2026-10-10. | Continue using permitted execution; real runner/process cleanup verification remains separate work. |

Original TypeScript/lint defects are fixed in TA-001. Remaining bundling/runtime
failures are environment blockers. Real product credentials/requirements will be requested when a task
needs them; they do not block the current analysis or local fixture work.

## Session log

### 2026-10-10 — TA-004b session authorization

- Completed session bootstrap, API authorization, job ownership for cancellation
  and artifacts, safe image-only delivery, frontend in-memory credentials and
  explicit-action recovery after expiry/restart. Tokens stay out of URLs/storage.
- PASS: build/lint, 84 contract checks, 4 component tests, 25 browser scenarios.
  A real browser-to-Express fixture verifies CORS and two-session ownership.
  Work is stubbed there; it does not prove generated runner isolation.
- No blocker for this card; sandbox command startup failures were resolved with
  approved execution. Progress 5/5; docs/memory updated; no commit/push/PR.
- Next: TA-004c worker isolation, target/redirect restrictions and provider-data
  minimization. TA-004 overall remains open; TA-002/003 integration review remains.

### 2026-10-10 — TA-004a local API boundary

- Completed first sequential TA-004 card: loopback binding, browser Origin/Host
  checks, required header, JSON size/type validation and frontend headers.
- PASS: build/lint, 73 contracts, 4 component tests, 22 browser scenarios.
  Initial browser run had 22 missing-browser launch failures; installed Chromium
  and reran successfully. B01 resolved for these gates; TA-001 can now close.
- E2E uses controlled responses; full integration and real process cleanup are
  still pending for TA-002/003. TA-004a evidence records these limits.
- Next sequential work: TA-004b session authorization and restricted-worker
  design/implementation. TA-004 overall remains IN PROGRESS. No commit/push/PR.

### 2026-10-10 — TA-003 implementation and UI improvements

- User requested the next task and smoother UI; continued despite B01.
- Implemented owned job files, single active task, cancel/deadlines/disconnect
  handling, browser cleanup, process-tree termination and scoped retention.
- Improved setup guidance, responsive layout, focus/contrast, login labels,
  cancellation feedback and conflicting-action prevention.
- Validation: 50 contracts PASS; TypeScript/lint PASS; 21 own-app tests discovered.
  Browser execution and bundling BLOCKED by `spawn EPERM`.
- Remaining: real lifecycle and visual E2E checklist in TA-003 verification.
  Memory updated. No commit/push/PR. TA-004 is the next implementation area.

### 2026-10-10 — TA-002 implementation

- User explicitly requested next-task implementation despite TA-001's open
  environment blocker. TA-001 remains open.
- Changed server/frontend protocol to structured terminal results; raw console
  output no longer decides success. Added report identity/schema/totals checks,
  response validation, request timeout and distinct outcome UI.
- Validation: 37 contract tests PASS; TypeScript/lint PASS; 17 browser tests
  discovered. Browser/Vitest/bundling checks BLOCKED by `spawn EPERM`.
- Remaining: runtime review (B01); resource/session/screenshot isolation and
  cancellation are TA-003. No live-provider/private-target test was performed.
- Memory and verification record updated. Commit/PR: not created.

### 2026-10-10 — TA-001 implementation

- Completed changes: configuration fix, four unit tests, four isolated browser UI
  scenarios, accessible field names, backend lint coverage, terminal-code cleanup,
  E2E type checking and developer setup guidance.
- Validation: TypeScript PASS, lint PASS, own-app test discovery PASS.
- Runtime: full build/unit/E2E BLOCKED by process permissions; no runtime pass
  or browser screenshot claimed. Acceptance is 2/5; no implementation task closed.
- Remaining: run the three blocked gates, inspect failures/evidence, then update
  task state. TA-002 remains pending until TA-001's completion gate is satisfied.
- Memory updated. Commit/PR: not created; changes are local.

### 2026-10-10 — TA-000

- Completed: reviewed UI/server/generation/configuration, confirmed build and lint
  errors, attempted unit/E2E checks, researched official QA guidance, recorded
  roadmap, acceptance checks, blockers, QA strategy, and repository memory.
- Changed: project documentation and workflow instructions only.
- Review: code evidence and baseline command outcomes in `PROJECT_REVIEW.md`;
  full runtime review blocked by B01. Analysis deliverable is complete; product
  validation and enhancements remain pending.
- Documentation checks: local Markdown link targets resolve; `git diff --check`
  reported no whitespace errors in the tracked change. Status confirms only
  README, new workflow instructions, and new docs changed.
- Next: TA-001, beginning with the two TypeScript build errors.

## Implementation handoff template

Copy for every active task or subtask:

```text
Task ID / title:
Owner / state / updated date:
Planned start / actual start / actual finish:
Scope and acceptance checks:
Progress: N/M checks satisfied (list them)
Completed changes and files:
Checks: command/scenario, outcome, date, evidence location
E2E review: affected journeys, results, limitations
Blockers: ID, cause, owner, next action
Remaining work:
Next action and when (dependency or agreed date):
Decisions and memory updated:
Commit/PR: actual reference, or not created
```

