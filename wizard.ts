import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import bs58 from 'bs58';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.clear();
console.log(chalk.cyan("=========================================="));
console.log(chalk.cyan("   🧙‍♂️ KORA JANITOR - SETUP WIZARD"));
console.log(chalk.cyan("=========================================="));
console.log("This tool will configure your bot securely.\n");

const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

async function start() {
    // 1. Ask for Network
    console.log("Which network will you use?");
    console.log("1. Mainnet (Real Money)");
    console.log("2. Devnet (Testing)");
    const netChoice = await askQuestion(chalk.yellow("Enter 1 or 2: "));
    
    let rpcUrl = "https://api.devnet.solana.com";
    if (netChoice.trim() === '1') {
        const customRpc = await askQuestion(chalk.yellow("Enter your Helius/Alchemy RPC URL (or press Enter for public): "));
        rpcUrl = customRpc.trim() || "https://api.mainnet-beta.solana.com";
    }

    // 2. Ask for Private Key
    console.log(chalk.cyan("\n🔐 Private Key Setup"));
    console.log("Paste your Private Key below.");
    console.log(chalk.gray("(Accepts Base58 string OR JSON Array [12,34...])"));
    
    const rawKey = await askQuestion(chalk.yellow("Key: "));
    let finalKeyArray = "[]";

    try {
        if (rawKey.includes("[")) {
            // It's already an array
            JSON.parse(rawKey); // Check if valid
            finalKeyArray = rawKey.trim();
        } else {
            // It's a Base58 string, convert it
            const decoded = bs58.decode(rawKey.trim());
            finalKeyArray = `[${decoded.toString()}]`;
        }
        console.log(chalk.green("✅ Key format verified."));
    } catch (e) {
        console.log(chalk.red("❌ Invalid Key format! Please try again."));
        process.exit(1);
    }

    // 3. Generate .env file
    const envContent = `RPC_URL=${rpcUrl}\nOPERATOR_PRIVATE_KEY=${finalKeyArray}\nDRY_RUN=true`;
    
    fs.writeFileSync('.env', envContent);
    
    console.log(chalk.cyan("\n=========================================="));
    console.log(chalk.green("✅ SETUP COMPLETE!"));
    console.log(chalk.white("Configuration saved to .env"));
    console.log(chalk.gray("You can now run 'npx ts-node dashboard.ts'"));
    console.log(chalk.cyan("=========================================="));
    
    rl.close();
}

start();