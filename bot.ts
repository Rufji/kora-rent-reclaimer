import { 
    Connection, 
    Keypair, 
    PublicKey, 
    Transaction, 
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    createCloseAccountInstruction, 
    unpackAccount
} from '@solana/spl-token';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import figlet from 'figlet';
import Table from 'cli-table3';

// 1. SETUP & CONFIGURATION
dotenv.config();
const DRY_RUN = process.env.DRY_RUN === 'true';
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Load Operator Wallet
const secretKey = Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY || '[]'));
if (secretKey.length === 0) {
    console.log(chalk.red("❌ Error: Missing OPERATOR_PRIVATE_KEY in .env"));
    process.exit(1);
}
const operator = Keypair.fromSecretKey(secretKey);

// Global Stats
let stats = { scanned: 0, reclaimable: 0, rentValue: 0, skipped: 0 };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------
// SECTION 2: THE "DETECTIVE" (SCANNER)
// ---------------------------------------------------------
async function fetchSponsoredAccounts(operatorPubkey: PublicKey) {
    process.stdout.write(chalk.blue(`\n🔍 Scanning transaction history (Slow Mode)... `));
    
    // REDUCED LIMIT: Only check last 25 to avoid angering the server
    const signatures = await connection.getSignaturesForAddress(operatorPubkey, { limit: 100 });
    let candidates: PublicKey[] = [];

    console.log(chalk.gray(`\n(Checking ${signatures.length} recent transactions. Please wait...)`));

    for (const sig of signatures) {
        if (sig.err) continue;

        // --- THE FIX: WAIT 2 SECONDS BETWEEN CHECKS ---
        await sleep(100); 
        process.stdout.write('.'); 

        try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.transaction.message.instructions) continue;

            tx.transaction.message.instructions.forEach((ix: any) => {
                if (ix.program === 'system' && ix.parsed?.type === 'createAccount') {
                    if (ix.parsed.info.source === operatorPubkey.toBase58()) {
                        candidates.push(new PublicKey(ix.parsed.info.newAccount));
                    }
                }
            });
        } catch (e) {
            // If one fails, just skip it and keep going
        }
    }
    console.log(" Done.");
    return [...new Set(candidates.map(k => k.toBase58()))].map(s => new PublicKey(s));
}

// ---------------------------------------------------------
// SECTION 3: THE "JUDGE" (ANALYZER)
// ---------------------------------------------------------
async function analyzeAccount(accountPubkey: PublicKey) {
    stats.scanned++;
    
    // --- THE FIX: WAIT 1 SECOND HERE TOO ---
    await sleep(1000);

    const info = await connection.getAccountInfo(accountPubkey);
    
    if (!info) return { status: 'CLOSED', reason: 'Account does not exist', lamports: 0 };
    if (info.lamports === 0) return { status: 'CLOSED', reason: 'Already empty', lamports: 0 };

    if (info.owner.equals(TOKEN_PROGRAM_ID)) {
        try {
            const data = unpackAccount(accountPubkey, info, TOKEN_PROGRAM_ID);
            
            if (data.amount > BigInt(0)) return { status: 'SKIP', reason: 'Has Token Balance', lamports: info.lamports };
            
            const isCloseAuth = data.closeAuthority ? data.closeAuthority.equals(operator.publicKey) : data.owner.equals(operator.publicKey);
            
            if (isCloseAuth) {
                return { status: 'RECLAIM', reason: 'Empty & Auth Held', lamports: info.lamports };
            } else {
                return { status: 'SKIP', reason: 'No Close Authority', lamports: info.lamports };
            }
        } catch (e) {
            return { status: 'SKIP', reason: 'Parse Error', lamports: info.lamports };
        }
    }

    return { status: 'SKIP', reason: 'Not a Token Account', lamports: info.lamports };
}

// ---------------------------------------------------------
// SECTION 4: THE "JANITOR" (EXECUTOR)
// ---------------------------------------------------------
async function reclaimRent(account: PublicKey, lamports: number) {
    const solAmount = (lamports / 1e9).toFixed(4);

    if (DRY_RUN) {
        return chalk.yellow(`Simulated Reclaim (+${solAmount} SOL)`);
    }

    try {
        const tx = new Transaction().add(
            createCloseAccountInstruction(account, operator.publicKey, operator.publicKey)
        );
        const sig = await sendAndConfirmTransaction(connection, tx, [operator]);
        return chalk.green(`SUCCESS! (+${solAmount} SOL)`);
    } catch (e) {
        return chalk.red(`FAILED: ${e}`);
    }
}

// ---------------------------------------------------------
// SECTION 5: MAIN EXECUTION LOOP
// ---------------------------------------------------------
async function main() {
    console.clear();
    console.log(chalk.green(figlet.textSync('KORA  BOT', { horizontalLayout: 'full' })));
    console.log(chalk.gray(`  Operator: ${operator.publicKey.toBase58()}`));
    console.log(chalk.gray(`  Network:  MAINNET (Public RPC)`));
    console.log('===============================================================');

    try {
        const candidates = await fetchSponsoredAccounts(operator.publicKey);
        console.log(chalk.cyan(`\n🔎 Found ${candidates.length} candidate accounts.`));

        if (candidates.length === 0) {
            console.log(chalk.yellow("No sponsored accounts found in recent history."));
            return;
        }

        const table = new Table({ 
            head: ['Account', 'Status', 'Reason', 'Action'],
            colWidths: [20, 15, 25, 30]
        });

        for (const acc of candidates) {
            const analysis = await analyzeAccount(acc);
            let actionResult = "-";

            if (analysis.status === 'RECLAIM') {
                stats.reclaimable++;
                stats.rentValue += analysis.lamports;
                actionResult = await reclaimRent(acc, analysis.lamports);
            } else {
                stats.skipped++;
            }

            table.push([
                acc.toBase58().slice(0, 8) + '...',
                analysis.status === 'RECLAIM' ? chalk.green('RECLAIM') : chalk.white(analysis.status),
                analysis.reason,
                actionResult
            ]);
        }

        console.log(table.toString());
        console.log('\n================== SUMMARY ==================');
        console.log(`📊 Scanned:      ${stats.scanned}`);
        console.log(`💰 Reclaimed:    ${chalk.green((stats.rentValue / 1e9).toFixed(4) + ' SOL')}`);
        
    } catch (error) {
        console.log(chalk.red("\n❌ Error: Still hitting Rate Limits."));
        console.log("Try Option B: Get a free API Key from Helius or Alchemy.");
    }
}

main();