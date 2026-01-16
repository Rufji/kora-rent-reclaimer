import { Connection, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createInitializeAccountInstruction, TOKEN_PROGRAM_ID, ACCOUNT_SIZE, NATIVE_MINT } from '@solana/spl-token';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// 1. SETUP
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const secretKey = Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY || '[]'));
const operator = Keypair.fromSecretKey(secretKey);

async function createStrandedAccount() {
    console.log(chalk.yellow("🧪 Creating a 'Stranded' Token Account to test the Bot..."));

    // Generate a random address for the new account
    const newAccount = Keypair.generate();

    // Calculate rent
    const rent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

    // Create a Transaction that:
    // 1. Creates a new account on-chain (Owned by Token Program)
    // 2. Initializes it as a "Wrapped SOL" Account (using NATIVE_MINT)
    const tx = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: operator.publicKey,
            newAccountPubkey: newAccount.publicKey,
            lamports: rent,
            space: ACCOUNT_SIZE,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeAccountInstruction(
            newAccount.publicKey,
            NATIVE_MINT, // <--- FIXED: Using a valid Mint address now
            operator.publicKey
        )
    );

    try {
        const sig = await sendAndConfirmTransaction(connection, tx, [operator, newAccount]);
        console.log(chalk.green(`✅ Success! Created stranded account: ${newAccount.publicKey.toBase58()}`));
        console.log(chalk.cyan(`💰 You just locked ${rent / 1e9} SOL. Now run 'npx ts-node bot.ts' to get it back!`));
    } catch (e) {
        console.log(chalk.red(`❌ Failed to create test account: ${e}`));
    }
}

createStrandedAccount();