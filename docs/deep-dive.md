Kora Rent Reclaimer — Deep Dive

Overview

This document explains the design, safety model, and implementation details of the Kora Rent Reclaimer (https://github.com/Rufji/kora-rent-reclaimer). It is written for reviewers and Kora operators who need to understand how rent is locked, how the bot detects reclaimable accounts, and the safeguards used to avoid accidental loss.

1. Background — rent and Kora sponsorship

- Solana rent: every account requires a minimum balance (rent-exempt threshold) to remain on-chain; when an account is closed, its lamports are returned to a recipient (usually the payer or a designated authority).
- Kora sponsorship: a Kora node (paymaster) funds account creation for end users. The operator pays the rent. Over time, sponsored accounts may be abandoned but remain on-chain, locking SOL in aggregate.

2. Goals

- Automatically detect sponsored accounts that are safe to close.
- Recover rent back to the operator treasury with high safety guarantees.
- Provide clear audit trails and an approval workflow.
- Support both local reclaim (bot signs & sends) and remote instruct (Kora node performs the reclaim).

3. Threat model & safety constraints

- Threats:
  - Accidental closure of active user accounts (loss of user funds).
  - Malicious or compromised Kora nodes that attempt unauthorized reclaims.
  - Rate-limiting or RPC failures causing false positives/negatives.

- Mitigations implemented:
  - Dry-run default: DRY_RUN=true by default — no on-chain writes.
  - Authority check: only accounts where operator holds closeAuthority (or is owner) are considered.
  - Balance guard: token balance must be zero for token accounts.
  - Approval gating: at least N successful dry‑runs + explicit operator approval before allowing live reclaim.
  - Budget caps: per‑run account limits and daily lamports cap to limit blast radius.
  - Audit DB: every action (simulate + final tx) is recorded in `reclaimer.db` with operator, timestamp and txSig.
  - Remote-exec opt-in only: `KORA_REMOTE_EXECUTE` disabled by default; remote instruct requires TLS + API key.

4. Detection heuristic

- Primary source: on‑chain transaction history of the operator (SystemProgram.createAccount instructions where payer == operatorPubkey).
- Optional source: Kora’s own sponsored-account endpoint (preferred when `KORA_URL` is configured) — faster and language-agnostic.
- Reasoning: scanning transaction history finds accounts the operator paid for even if Kora metadata is not available.

5. Reclaim predicate (high precision)

An account is marked RECLAIM only when all these are true:
  - Account exists and lamports > 0
  - For token accounts: token amount == 0
  - Operator has CloseAuthority OR operator is account owner

6. Reclaim flow

- Simulation (default): construct createCloseAccountInstruction and validate it can be built (no submission). Record `simulated_ok` in DB.
- Approval: operator inspects simulated results via dashboard/CLI and approves only allowed ATAs.
- Execution: either local (bot signs & sends using OPERATOR_PRIVATE_KEY) or remote instruct (bot calls Kora `/reclaim`).
- Post-exec: store txSig and reclaimed lamports in DB; emit Discord/webhook alert.

7. Database & audit

- Schema highlights: id, owner, ata, simulated_ok, dry_run_count, approved, reclaimed_tx, reclaimed_lamports, last_reclaimed_at, notes, created_at.
- Export: CSV export for operator accounting and for submission to contest judges.

8. Operational recommendations

- Run the scanner on devnet first; use `setup_simulation.ts` to create test ATAs.
- Run at least two dry-runs and manually inspect the `reclaimer.db` rows before approving.
- Configure private RPC (Helius/Alchemy) for production mainnet scans to avoid rate limits.
- Schedule periodic runs with cron or systemd; keep the dashboard separate from the scanning cron to avoid coupling.

9. Limitations & future work

- Heuristic coverage: we detect SystemProgram.createAccount payers but won't capture every meta-level sponsorship that occurs off-chain unless Kora exposes it.
- Replay/forensics: extend with a Merkle-backed audit log or off-chain signatures from Kora for provable sponsorship.
- Alerting: add webhook escalation (PagerDuty/SMS) for large reclaim events.

10. Acceptance tests (summary)

- Create a simulated ATA with `setup_simulation.ts`.
- Register it: `scripts/reclaim-one.ts --ata <ATA> --register` or `register()` API.
- Run 2 dry-runs and confirm `dry_run_count >= 2`.
- Approve via `npm run approve-ata -- <ATA>`.
- Run a single live reclaim (devnet) and confirm `reclaimed_tx` is present.

Appendix: important files

- Scanner: `bot.ts`
- DB & orchestrator: `src/kora-reclaimer.ts`
- Kora adapter: `src/kora-adapter.ts` and `koraClient.ts`
- Simulation: `setup_simulation.ts`
- Mock server: `scripts/mock-kora-server.ts`

Contact / demo

If you want I can record a 5–8 minute walkthrough demonstrating the acceptance tests and explain the safety checks live.