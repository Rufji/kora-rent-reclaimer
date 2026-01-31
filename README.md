<<<<<<< HEAD
```
  _  __  ___   ____     _         _    _    _   _  ___  _____  ___   ____  
 | |/ / / _ \ |  _ \   / \       | |  / \  | \ | ||_ _||_   _|/ _ \ |  _ \ 
 | ' / | | | || |_| | / _ \   _  | | / _ \ |  \| | | |   | | | | | || |_| |
 | . \ | |_| ||  _ < / ___ \ | |_| |/ ___ \| |\  | | |   | | | |_| ||  _ < 
 |_|\_\ \___/ |_| \_/_/   \_\ \___//_/   \_\_| \_||___|  |_|  \___/ |_| \_\


Automated cleanup system for Kora Nodes. Safely identifies idle accounts and reclaims locked SOL rent back to the operator.

🚨 The Problem: The "Rent Leak"

  Kora Nodes act as "Paymasters," sponsoring the creation of thousands of accounts for users. On Solana, every account requires a small deposit called Rent (approx. 0.002 SOL) to store data on-chain. 

  When users churn or abandon their sessions, these accounts remain on-chain, effectively locking the operator's SOL forever. For a busy node, 1,000 abandoned accounts = ~2 SOL ($300+) lost per month.


🛡️ The Solution: Kora Janitor

This tool acts as an automated garbage collector. It scans the operator's transaction history to find accounts they paid for, checks if they are truly empty, and safely closes them to recover the funds.



Key Features

🔍 Smart Scanning: Automatically detects accounts funded by your wallet.

🛡️ Safety First: * Simulated Mode: Audits actions without touching funds.
  * Authority Check: Verifies you have "Close Authority" before attempting action.
  * Balance Guard: Never touches accounts that still hold user tokens.

📊 Pro Dashboard: A local web interface (Glassmorphism UI) to visualize and approve reclaims.

🤖 Discord Alerts: Real-time notifications when funds are recovered.

⚡ Mainnet Optimized: Supports private RPCs (Helius/Alchemy) to avoid rate limits.



🚀 Quick Start

1. Prerequisites

  * Node.js (v16+)
  * A Solana Wallet (Private Key) with some SOL.

2. Installation

  Clone the repo and install dependencies:Bash
  git clone [https://github.com/Rufji/kora-rent-reclaimer.git](https://github.com/Rufji/kora-rent-reclaimer.git)
  cd kora-rent-reclaimer
  npm install


3. Setup Wizard (Recommended)
  Run the interactive wizard to configure your .env file securely

  Run the wizard: npx ts-node wizard.ts

  * Select Mainnet (Real Money) or Devnet (Testing).
  * Paste your Operator Private Key (stored locally only).
  * Optionally, add a Discord Webhook for alerts.

  
🕹️ Usage

Option A: The Web Dashboard (Best Experience)

  Launch the visual interface to Audit and Reclaim.
  Run the dashboard: npx ts-node dashboard.ts

  * Open your browser at http://localhost:3000
  
  Step 1: Click Scan History to find idle accounts.
  
  Step 2: Review the "Ready" accounts.
  
  Step 3: Click Reclaim Funds to execute the close transactions.


Option B: The CLI Bot (Headless)

  Run a quick scan directly in the terminal.

  Run the bot: npx ts-node bot.ts


Option C: Simulation (Test "Trash" Creation)

  Want to test the bot without waiting for real users? 
  Create a dummy "stranded" account

  Run the simulation:Bash npx ts-node setup_simulation.ts
    This creates a Token Account on-chain and abandons it.

  Run the bot afterwards to see it detect and clean this specific account.


⚙️ Configuration (.env)
  
  Variable                      Description

  RPC_URL                       Your Solana RPC Endpoint (Use Helius/Alchemy for Mainnet).
  OPERATOR_PRIVATE_KEY          Array [12, 45, ...] or Base58 string of the wallet.
  DRY_RUN                       true = Read-only simulation. false = Real transactions.
  DISCORD_WEBHOOK_URL           (Optional) URL to receive "Rich Embed" alerts.
  KORA_URL                      (Optional) HTTP URL for an external Kora service that can supply sponsored-account lists.
  KORA_API_KEY                  (Optional) Bearer token for the Kora service (keep secret).
  KORA_REMOTE_EXECUTE           (optional) true = ask remote Kora to perform reclaims; false = perform reclaims locally.


Example .env (do NOT commit):

```
RPC_URL=https://api.mainnet-beta.solana.com
OPERATOR_PRIVATE_KEY=[1,2,3,...]
OPERATOR_PUBLIC_KEY=YourOperatorPubkeyHere
DRY_RUN=true
KORA_URL=http://localhost:8080
KORA_API_KEY=
KORA_REMOTE_EXECUTE=false
RECLAIMER_DB=./reclaimer.db
```

Security: add `.env` and any DB files to `.gitignore`. See **Safety & policy defaults** above.

### Safety enforcement (automatic)
- The reclaimer **requires >= 2 successful dry-runs** and an explicit operator **approval** before performing an automatic live reclaim for a registered ATA.
- Per-run and daily budget caps are enforced by environment variables:
  - `PER_RUN_ACCOUNT_LIMIT` (default 50)
  - `DAILY_LAMPORT_LIMIT` (default ~2 SOL)
  - `MIN_DRY_RUNS_FOR_AUTO` (default 2)
- Orphan accounts (no registered owner) are blocked and flagged for manual review.

### Approval & audit CLI
- List pending approvals:
  - `npm run list-approvals`
- Approve an ATA (after at least two dry-runs):
  - `npm run approve-ata -- <id>`

### Migration
After pulling changes, run:
```
npm run db:migrate
```
This will add approval and audit columns to the DB (idempotent).

**DO NOT** enable `DRY_RUN=false` or `KORA_REMOTE_EXECUTE=true` until you've inspected dry-run results and approved the specific ATA(s).
  
  
  

🐳 Docker Support

Deploy as a containerized service on your node infrastructure.

  Bash
  # Build the image
  docker build -t kora-janitor .

  # Run container (Mounting .env)
  docker run -p 3000:3000 --env-file .env kora-janitor


🧠 Technical Architecture

1. The Detective (Scanner)
  fetchSponsoredAccounts scans the blockchain history (getSignaturesForAddress) looking for SystemProgram.createAccount instructions where the source (payer) matches the Operator's wallet.

2. The Judge (Analyzer)

  analyzeAccount performs a strict 3-step check:
   i. Existence: Does the account still exist?
   ii. Balance: Is the Token Balance > 0? (If yes, SKIP).
   iii. Authority: Does the Operator hold CloseAuthority or Owner privileges? (If no, SKIP).

3. The Janitor (Executor)
  If all checks pass, it constructs a createCloseAccountInstruction which:
   i. Deletes the account from the state.
   ii.Transfers the rent lamports back to the Operator.
   

⚠️ Safety Disclaimer

Private Keys: Your key is stored in .env and never leaves your server.
Audit: Always run in DRY_RUN=true mode first to verify which accounts will be closed.
Liability: This software is provided "as is". The user assumes all responsibility for transactions executed.


## 🕒 Automated Monitoring (Production Setup)
For active, 24/7 monitoring of the Kora Node, we recommend setting up a standard **Cron Job**. This decouples the monitoring logic from the dashboard server, ensuring reliability.

### Recommended Schedule: Every 6 Hours
1. Open your server's crontab:
   ```bash
   crontab -e

2. Add this line to run the cleaner every 6 hours:
  ```bash
  0 */6 * * * cd /root/kora-janitor && npm run scan >> scan.log 2>&1

🏆 Hackathon Submission

Built for Superteam Nigeria - Kora Rent Reclaimer Bounty

Dev: Rufai Mahmud Oladimeji (@mahmudlab on x)
Stack: TypeScript, Express, TailwindCSS, Solana web3.js
