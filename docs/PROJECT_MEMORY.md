# Project memory

Last updated: 2026-10-10, TA-016 Pages site verification handoff.
Read with `TASKS.md` before resuming. This file persists facts and decisions in
the repository; it is not an automatic monitoring service.

## User intent and workflow

- Enhance Test Army task by task, documenting progress, blockers, completed work,
  next steps and timing/dependencies. Review changes with E2E and keep memory.
- User started TA-001, then explicitly requested TA-002 despite blocked runtime
  verification. This authorizes implementation progression, not marking checks passed.
- Existing usage: start `npm run dev` and `npm run server`, then visit port 5173.
  `npm run dev:all` is already an equivalent convenience script.
- Current workspace is `D:\Project\Phase_2`. User previously mentioned
  `C:\Phase_2`; resolve paths from the actual checkout.
- GitHub destination supplied by user: `https://github.com/parth6001/test-army-qa.git`.
  Local commit `70c6546` now exists and working tree was clean at review start.
  Remote upload and GitHub visibility were not verified during this review;
  private visibility was recommended earlier, not confirmed remotely.

## Current implementation

- React/TypeScript + Vite UI, Express backend, Playwright execution.
- UI: inspect page, optional login, scenario presets, generate, review/edit,
  run/rerun, download code, report rows and failure screenshots.
- Backend supports OpenRouter or Claude Agent SDK branches. Model availability,
  subscription permissions, and live provider behavior were not verified.
- `generate-tests.mjs` is a separate Anthropic API CLI and differs from UI flow.
- UI runs use external Playwright config; default `test:e2e` now discovers only
  `tests/app` and uses a dedicated Vite server on 127.0.0.1:5174 without reuse.
- No existing task tracker, project memory, or CI workflow was found before TA-000.
- Local environment, sessions, generated specs and artifacts are ignored by Git.
  Never copy their contents into documentation or shared evidence.

## Review evidence

Latest TA-004b validation: build/lint PASS, 84 contract checks PASS, 4 component
tests PASS, 25 Chromium scenarios PASS (1.4 minutes). The browser suite now has
24 controlled-response UI tests plus one real browser-to-Express session/CORS/
ownership/image/cancel fixture. It never executes submitted code or calls providers.
No environment blocker remains for these gates when using permitted execution.

TA-004a update superseding the earlier environment results below: build (including
Vite), lint, 4 component tests and 73 contract tests now pass using approved
execution outside the sandbox. Browser launch then identified missing Chromium
v1223; the approved installer completed. See TA-004a verification for the rerun.
Rerun PASS: 22 browser tests, exit 0, 1.4 minutes. B01 resolved for these gates;
TA-001 is DONE. TA-002/003 are REVIEW pending real integration/process cleanup
and manual visual review; their old BLOCKED entries are historical.
The previous blocked results below are retained as historical evidence.

- Original TypeScript errors corrected: Vitest typed config and meaningful tests.
- TypeScript PASS, exit 0, including own-app E2E/config files.
- Lint PASS, exit 0; backend/CLI JavaScript now covered. Backend report formatting
  uses Node's `stripVTControlCharacters` instead of a literal-control regex.
- E2E discovery PASS: now 21 own-app tests, no generated target specs.
- Contract checks PASS: 50 Node tests for result/report/event-stream behavior.
- Full build BLOCKED: Vite config loading hits `spawn EPERM` after TypeScript passes.
- Unit BLOCKED: `spawn EPERM` while loading Vite/Vitest config; no executed tests.
- Local E2E BLOCKED: `spawn EPERM`, no completed browser test or screenshot review.
- Earlier access-denied shell launches and Git metadata write failures were
  environment limitations; do not assume a source-code fix resolves them.
- Runtime screenshot/interaction review and live AI generation are unverified.

## Findings to preserve

- TA-002 replaces stdout success inference with a validated structured result;
  contract tests pass but browser behavior is runtime-unverified.
- UI jobs now own code, auth, report and screenshots under ignored
  `.test-army/runs/<uuid>/`. Auth is deleted on completion; old job folders expire
  after seven days on a later job start. Legacy files are preserved. Login still
  does not verify authentication success.
- Generated code executes with server environment; execution/API boundaries need
  restriction before broader use. Scraped content is untrusted input.
- Job provider requests receive the job abort signal; startup model discovery
  still lacks an explicit deadline. Empty candidates now produce a readable error.
- Four component-unit tests and 21 browser UI scenarios cover controls/workflows
  and result/error handling; they are type-checked but runtime-unverified.
  Separately, 50 pure contract tests have executed successfully. Browser API
  responses are controlled; real backend/provider/target integration is pending.
- No product history, project profiles, multi-page plan, or quality benchmark yet.

## Proposed direction and decisions

- Prioritize trustworthy results and isolated execution, then product reuse,
  evidence-backed scenarios, and additional testing capabilities.
- Keep the existing stack and extract modules while covering their behavior.
- Build local controlled fixtures for Test Army tests; do not use old internal
  targets as automatic regression dependencies.
- Roadmap scope starts with browser products; no promise of universal/native
  coverage or zero defects. Saved suites should rerun without another AI call.
- Repair suggestions must preserve expected behavior and be reviewable.
- Timing is expressed as dependency order and rough effort, not promised dates.
- Tracker and memory currently live in repository documents; an in-app project
  and run-history UI is a future TA-008 feature.

## Latest handoff

### TA-016 — GitHub Pages project site (review)

- User clarified they wanted a GitHub Pages project-details site with an app
  screenshot, not an About screen inside the product. In-app About changes were
  removed; app source is unchanged for this card.
- Static site in `docs/index.html` and `docs/styles.css`, with workspace screenshot
  in `docs/assets/test-army-workspace.png`. Describes workflow, stack, provider
  data flow, local sessions, host-access limit and current roadmap. README links
  to the anticipated Pages URL.
- `.github/workflows/pages.yml` deploys `docs/` on main changes with scoped
  permissions. `npm run capture:preview` regenerates the clean screenshot;
  `npm run test:site` reviews the static site at desktop and mobile.
- Validation: site E2E PASS after fixing a 10-pixel mobile overflow. App build/
  lint PASS; screenshot visually reviewed. No backend/provider/target contacted.
- Status REVIEW until push and public deployment are verified. No in-app changes.

### TA-004b — session authorization, 2026-10-10

- DONE, 5/5 acceptance checks satisfied. Overall TA-004 still IN PROGRESS.
- `/api/session` issues random eight-hour tokens for approved UI origins. Other
  API and screenshot requests require bearer authorization bound to that origin.
  Server retains token hashes and bounded in-memory session/job ownership maps;
  frontend keeps the token only in memory. Reload/backend restart lose ownership.
- Only owner session may cancel a job or fetch its screenshots. Generic static
  artifact delivery removed; scoped raster images only (PNG/JPEG/WebP, 10 MB),
  no links/traversal, no-store. Frontend loads images as authorized blobs and
  revokes blob URLs on unmount. New sessions cannot recover old screenshots.
- A rejected 401 is displayed without replaying work; next user action reconnects.
  Bootstrap has a 15-second deadline. Sessions cap at 128 and jobs at 512/session.
  Session expiry blocks new requests; an admitted job keeps its existing deadline.
- Browser sessions separate clients, not Windows users. Local programs may
  forge browser headers and bootstrap their own sessions. Worker still has host
  access. Next card TA-004c: real worker isolation, secret-free environment,
  approved destinations/redirects and provider-data minimization.
- Validation: 84 contracts, 4 component tests, 25 browser scenarios PASS;
  build/lint PASS. Evidence: `docs/verification/TA-004b.md`. No commit/push/PR.
- Restart backend and reload UI together to use the new authorization protocol.

### Previous TA-004a handoff — local API boundary, 2026-10-10

- User requested the next task. Split TA-004 into small sequential cards and
  implemented API caller/input checks first. Backend binds IPv4 loopback only;
  API requires exact localhost/127.0.0.1 UI origins on 5173/5174, exact API Host,
  `X-Test-Army: 1`, JSON POST bodies, and bounded typed inputs before admission.
- Frontend sends the header on preview/generate/run/cancel. Restart backend and
  reload frontend together. Vite preview port 4173 is not approved.
- Real local HTTP fixture rejects bad callers/inputs before handler execution;
  no private target or live model used. Fetch replaced the forged Host in the
  first fixture attempt; using node:http preserves it and all 73 checks pass.
- Remaining TA-004: real session authorization (including screenshots/cancel),
  isolated worker, enforced destination/redirect scope and provider data
  minimization. Headers can be forged by local programs. Generated code still
  has host access; URL syntax validation does not enforce target scope.
- Evidence: `docs/verification/TA-004a.md`. No commit/push/PR created.
- TA-004a DONE, 5/5 card checks satisfied; TA-004 overall IN PROGRESS. Next:
  TA-004b session authorization and restricted worker. No current environment
  blocker for the executed checks. All 22 controlled browser scenarios pass.

### Previous TA-003 handoff (historical)

- TA-003 implementation complete, BLOCKED on real browser/process verification.
  TA-001/002 remain open. User requested advancing and improving UI despite B01.
- Added job ownership/admission, per-job files/session/artifacts, cancellation,
  disconnect cleanup, provider abort, two-minute runner/four-minute job deadlines,
  Windows process-tree termination and seven-day retention at task startup.
- Failed resource cleanup holds the server admission gate closed; the UI tells
  users to restart before retrying. Do not silently allow overlapping owned work.
- UI has Cancel task and cleanup feedback, preview/run interlock, guided setup and
  empty state, mobile sizing, visible keyboard focus, improved contrast, reduced
  motion, accessible login names and log scrolling that avoids page jumps.
- Validation: 50 contract tests PASS; TypeScript/lint PASS; 21 browser tests
  discovered. Browser run and Vite bundling again failed with `spawn EPERM`.
  Browser/process fakes in contract tests do not prove real process cleanup.
- Evidence and required real-runtime checklist: `docs/verification/TA-003.md`.
  Progress: 3/5 review gates have evidence; real process/browser cleanup and visual
  E2E review remain blocked. No visual screenshot or E2E success claimed.
- Next verification: build/lint/test:all and the lifecycle checklist in a permitted
  browser-capable environment. Next implementation: TA-004 execution/API boundary.
- Restart backend and reload frontend together because streams now send job IDs.
  The cancel endpoint is `/api/jobs/:id/cancel`; IDs are not authentication.
- Generated code still has host access, login success is not verified, and forced
  process/OS termination may leave files until retention. Preserve TA-004/005 scope.
- Saved products/history remains TA-008; current UI work does not implement it.
- No commit, push, or PR created. Never record credentials or private page content.
