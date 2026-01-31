Contributing — quick guide

- Run the setup wizard: `npx ts-node wizard.ts` (creates .env)
- Run tests: `npx tsc --noEmit && npm run ci-smoke`
- DB migration: `npm run db:migrate`
- To propose changes: open a PR against `main` with the PR template filled in.

Safety rules for contributors
- Never disable `DRY_RUN` in PRs. All PRs must pass smoke tests in dry-run mode.
- Any change that touches reclaim logic must include an acceptance test (devnet) and a safety review.