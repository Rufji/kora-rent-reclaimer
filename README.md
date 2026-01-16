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


🏆 Hackathon Submission

Built for Superteam Nigeria - Kora Rent Reclaimer Bounty

Dev: Rufai Mahmud Oladimeji (@mahmudlab on x)
Stack: TypeScript, Express, TailwindCSS, Solana web3.js
