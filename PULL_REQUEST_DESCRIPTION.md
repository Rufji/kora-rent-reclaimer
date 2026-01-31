Title: feat: Kora integration + DB-backed reclaim workflow, approval gating, CI smoke, deep-dive

Summary
- Adds full Kora integration (list + remote instruct), a DB-backed reclaimer with audit trail, an approval workflow, per-run/daily safety caps, demo & deep-dive documentation, and CI smoke tests.

Why
- Prevents silent rent leakage for Kora operators by providing an auditable, safe reclaim automation with strong operator controls.

Changes
- New: `src/kora-reclaimer.ts`, `src/kora-adapter.ts`, `koraClient.ts`
- New: approval CLI (`scripts/approve-ata.ts`), DB migration (`scripts/db-migrate.ts`), demo & deep-dive docs
- Modified: `bot.ts`, `test_connection.ts`, `README.md`, added safety enforcement
- CI: add lightweight smoke job (TypeScript compile + dry-run)

Testing
- Unit: (see tests/ folder) — none included in this PR; smoke script included
- Manual: created simulated ATA (devnet), ran two dry-runs, approved and executed a controlled reclaim (devnet)

How to review (suggested)
1. Run `npm ci && npm run db:migrate`
2. Run `npm run mock-kora` (optional) and `npx ts-node setup_simulation.ts`
3. Run smoke: `npm run ci-smoke`
4. Inspect `reclaimer.db` and `npx ts-node scripts/print-reclaims.ts`

Security notes
- Default: DRY_RUN=true; remote-exec disabled by default
- Approval gating and budget caps are enforced; please verify the `MIN_DRY_RUNS_FOR_AUTO` and `DAILY_LAMPORT_LIMIT` values before enabling production run

Checklist (for PR)
- [ ] Code compiles and passes smoke test
- [ ] README updated with demo steps
- [ ] Deep-dive doc included
- [ ] DB migration added
- [ ] Approval workflow implemented

Screenshots / Recording
- I recommend a 5–8 minute walkthrough showing: simulation → dry‑run → approval → live reclaim (devnet).