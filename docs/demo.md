Kora Rent Reclaimer — Demo & runbook

Goal
- Demonstrate end-to-end: create simulated ATA (devnet), discover it (Kora or on-chain), simulate reclaim, approve, perform reclaim, verify audit.

Quick smoke (PowerShell) — copy / paste
1) Start mock Kora (optional)
   $env:MOCK_KORA_PORT=8081; npm run mock-kora

2) Create a simulated ATA (devnet)
   npx ts-node setup_simulation.ts

3) Register the ATA in the reclaimer DB (one-liner)
   npx ts-node -e "const R=await import('./src/kora-reclaimer'); const ata='<ATA>'; const { Keypair } = await import('@solana/web3.js'); const sec = Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY)); const owner = Keypair.fromSecretKey(sec).publicKey.toBase58(); R.register({ id: ata, owner, ata }); console.log('registered', ata);"

4) Dry-run scan (Kora if configured)
   $env:KORA_URL='http://localhost:8080'; $env:DRY_RUN='true'; npx ts-node -e "const R = await import('./src/kora-reclaimer'); process.env.OPERATOR_PUBLIC_KEY = (await import('@solana/web3.js')).Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY))).publicKey.toBase58(); console.log(JSON.stringify(await R.scanAndReclaim({dryRun:true, operator:{pubkey:process.env.OPERATOR_PUBLIC_KEY}}), null,2));"

5) Confirm dry-run rows
   npm run list-approvals
   npx ts-node scripts/print-reclaims.ts

6) Approve the ATA (after inspection)
   npm run approve-ata -- <ATA>

7) Execute a controlled reclaim (devnet)
   npm run reclaim:one -- --ata <ATA> --run

Expected results
- Dry-run: simulated_ok=1, notes contain "would-close"
- After approve+run: reclaimed_tx populated, reclaimed_lamports > 0

Troubleshooting
- If `Account does not exist` — the simulation ATA may have been closed or you used a different network/RPC.
- If Kora unreachable — verify `KORA_URL` and that the Kora process is running.

Presentation tips
- Show audit CSV (`npm run print-reclaims`) before and after reclaim.
- Emphasize safety: two dry-runs + manual approval before any live reclaim.

Files to include in submission
- `docs/deep-dive.md` (this file)
- `README.md` (quickstart + safety)
- `reclaimer.db` (sample — do NOT commit secrets)