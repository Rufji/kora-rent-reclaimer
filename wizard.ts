import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

async function runWizard() {
    console.log("\n🧹  KORA JANITOR SETUP WIZARD  🧹");
    console.log("=====================================\n");

    // 1. Private Key
    const privateKey = await ask("1️⃣  Enter your Wallet Private Key (Array [1,2,3...]): ");
    if (!privateKey.startsWith('[') || !privateKey.endsWith(']')) {
        console.error("❌ Error: Key must be in format [1, 2, 3...].");
        process.exit(1);
    }

    // 2. Network Selection (The "Universe")
    console.log("\n2️⃣  Select Network (Where to connect):");
    console.log("   [1] Devnet  (For Testing/Play SOL)");
    console.log("   [2] Mainnet (For Real Money)");
    
    const netChoice = await ask("   Enter choice (1 or 2): ");
    let rpcUrl = "";
    
    if (netChoice.trim() === '2') {
        console.log("   👉 Selected: MAINNET (Real Money)");
        // Mainnet often needs a private RPC for speed, but public is fine for starting
        const customRpc = await ask("   Enter RPC URL (Press Enter for Public Mainnet): ");
        rpcUrl = customRpc.trim() || "https://api.mainnet-beta.solana.com";
    } else {
        console.log("   👉 Selected: DEVNET (Test Network)");
        rpcUrl = "https://api.devnet.solana.com";
    }

    // 3. Action Mode (Simulation vs Real)
    console.log("\n3️⃣  Select Action Mode:");
    console.log("   [1] DRY RUN (Simulate only. Safe. No transactions sent.)");
    console.log("   [2] ACTIVE  (Execute Cleanups. Gas fees paid. Rent reclaimed.)");
    
    const modeChoice = await ask("   Enter choice (1 or 2): ");
    const isDryRun = modeChoice.trim() === '2' ? 'false' : 'true'; // Default to true (safe)

    if (isDryRun === 'false') {
        console.log("   🔥 MODE: ACTIVE (Transactions will be sent!)");
    } else {
        console.log("   🛡️ MODE: DRY RUN (Simulation only)");
    }

    // 4. Discord Webhook
    console.log("\n4️⃣  Discord Alerts (Optional):");
    const webhook = await ask("   Enter Webhook URL (or press Enter to skip): ");
    
    // 5. Generate .env
    const envContent = `
# KORA JANITOR CONFIGURATION

# 1. Operator Wallet
OPERATOR_PRIVATE_KEY=${privateKey.trim()}

# 2. Connection (Determines Mainnet vs Devnet)
RPC_URL=${rpcUrl}

# 3. Mode (true = Simulate, false = Real Money)
DRY_RUN=${isDryRun}

# 4. Alerts
DISCORD_WEBHOOK_URL=${webhook.trim()}
`;

    fs.writeFileSync(path.join(__dirname, '.env'), envContent.trim());

    console.log("\n✅  SUCCESS! Configuration saved.");
    console.log("=====================================");
    console.log(`🌍 Network: ${netChoice.trim() === '2' ? 'Mainnet' : 'Devnet'}`);
    console.log(`⚙️  Mode:    ${isDryRun === 'false' ? 'ACTIVE (Real Txs)' : 'DRY RUN (Simulation)'}`);
    console.log("=====================================");
    console.log("👉  Run 'npx ts-node dashboard.ts' to start!");
    
    rl.close();
}

runWizard();