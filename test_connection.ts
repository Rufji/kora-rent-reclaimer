import { Connection, Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

// Load the .env file
dotenv.config();

async function main() {
    console.log(chalk.yellow("⏳ Testing connection to Solana..."));

    // 1. Try to connect to the network
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    try {
        const version = await connection.getVersion();
        console.log(chalk.green(`✅ Success! Connected to Solana node version: ${version['solana-core']}`));
    } catch (error) {
        console.log(chalk.red("❌ Failed to connect to Solana. check your internet connection."));
        return;
    }

    // 2. Try to read your wallet key
    const keyString = process.env.OPERATOR_PRIVATE_KEY;
    if (!keyString) {
        console.log(chalk.red("❌ Error: OPERATOR_PRIVATE_KEY is missing in .env file"));
    } else {
        try {
            const secretKey = Uint8Array.from(JSON.parse(keyString));
            const keypair = Keypair.fromSecretKey(secretKey);
            console.log(chalk.green(`✅ Wallet Loaded! Address: ${keypair.publicKey.toBase58()}`));
            console.log(chalk.cyan("Everything is ready for the main bot."));
        } catch (error) {
             console.log(chalk.red("❌ Error: The Private Key format in .env is wrong. It must be like [1, 2, 3...]"));
        }
    }
}

main();