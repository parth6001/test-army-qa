# Test Army project workflow

Read `docs/PROJECT_MEMORY.md` and `docs/TASKS.md` before starting project work.
The user wants small, sequential enhancements with progress, blockers, next steps,
and E2E review recorded in the repository.

- Select a task ID and record its scope and acceptance checks before implementation.
- Update its status, completed work, remaining work, blockers, and validation evidence
  at each meaningful handoff. Use dates and actual results; do not invent percentages.
- Follow `docs/QA_STRATEGY.md`. Review changed user journeys with E2E checks.
  A check that cannot run is BLOCKED, never PASS. Documentation-only work can use
  document review with the E2E applicability explained.
- Keep Test Army's own tests separate from tests it generates for target products.
  Use local fixtures for automated regression; do not run against private targets
  just because URLs appear in old generated specs.
- Update `docs/PROJECT_MEMORY.md` after completed tasks or significant discoveries.
  Store decisions and evidence, never credentials, cookies, sensitive page data,
  or provider responses containing private content.
- Review failures without deleting assertions, silently skipping tests, or weakening
  expected behavior to obtain a pass.
- Preserve existing local environment and browser-session files. Follow `.gitignore`.
- Treat the roadmap as planned work, not implemented functionality. Do not claim
  that E2E checks guarantee the absence of bugs.

