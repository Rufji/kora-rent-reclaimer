import express from 'express';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction, unpackAccount, NATIVE_MINT } from '@solana/spl-token';
import * as dotenv from 'dotenv';
import path from 'path';


// HELPER: Discord Notification
async function sendDiscordAlert(solAmount: string, count: number) {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) return;

    // Standard native fetch (Node 18+)
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: "💰 Kora Janitor Report",
                    description: `**Success!** Reclaimed rent from **${count}** idle accounts.`,
                    color: 5763719, // Green
                    fields: [
                        { name: "Recovered Value", value: `\`${solAmount} SOL\``, inline: true },
                        { name: "Operator", value: `\`${operator.publicKey.toBase58().slice(0,4)}...${operator.publicKey.toBase58().slice(-4)}\``, inline: true }
                    ],
                    footer: { text: "Automated Cleanup System" },
                    timestamp: new Date().toISOString()
                }]
            })
        });
        console.log("👾 Discord Alert Sent!");
    } catch (e) {
        console.log("Failed to send Discord alert (Check URL)");
    }
}

dotenv.config();

// CONFIG
const app = express();
const PORT = 3000;
const DRY_RUN = process.env.DRY_RUN === 'true'; // Still used for safety checks
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// LOAD WALLET
const secretKey = Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY || '[]'));
const operator = Keypair.fromSecretKey(secretKey);

// SETUP VIEW ENGINE
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// GLOBAL STATE
let dashboardData = {
    operator: operator.publicKey.toBase58(),
    dryRun: DRY_RUN,
    stats: { scanned: 0, reclaimable: 0, rentValue: 0 },
    results: [] as any[]
};

// --- ACTION 1: SCAN ONLY (Read-Only) ---
async function performScan() {
    let currentResults = [];
    let stats = { scanned: 0, reclaimable: 0, rentValue: 0 };
    
    console.log("🔍 Scanning Blockchain...");

    try {
        const signatures = await connection.getSignaturesForAddress(operator.publicKey, { limit: 50 });
        let candidates: PublicKey[] = [];

        for (const sig of signatures) {
            if (sig.err) continue;
            await sleep(200); // Gentle rate limit
            try {
                const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
                if (!tx || !tx.transaction.message.instructions) continue;
                tx.transaction.message.instructions.forEach((ix: any) => {
                    if (ix.program === 'system' && ix.parsed?.type === 'createAccount') {
                        if (ix.parsed.info.source === operator.publicKey.toBase58()) {
                            candidates.push(new PublicKey(ix.parsed.info.newAccount));
                        }
                    }
                });
            } catch (e) {}
        }
        
        const uniqueCandidates = [...new Set(candidates.map(k => k.toBase58()))].map(s => new PublicKey(s));

        for (const acc of uniqueCandidates) {
            await sleep(100);
            stats.scanned++;
            let row = { address: acc.toBase58(), status: 'UNKNOWN', reason: '', lamports: 0, canReclaim: false };
            
            try {
                const info = await connection.getAccountInfo(acc);

                if (!info) {
                    row.status = 'CLOSED'; row.reason = 'Account does not exist';
                } else if (info.lamports === 0) {
                    row.status = 'CLOSED'; row.reason = 'Already empty';
                } else if (info.owner.equals(TOKEN_PROGRAM_ID)) {
                    const data = unpackAccount(acc, info, TOKEN_PROGRAM_ID);
                    row.lamports = info.lamports;
                    
                    if (data.amount > BigInt(0)) {
                        row.status = 'SKIP'; row.reason = 'Has Token Balance';
                    } else {
                        const isCloseAuth = data.closeAuthority ? data.closeAuthority.equals(operator.publicKey) : data.owner.equals(operator.publicKey);
                        if (isCloseAuth) {
                            // HERE IS THE CHANGE: We mark it as READY, we don't close it yet.
                            row.status = 'READY';
                            row.reason = 'Waiting for Approval';
                            row.canReclaim = true;
                            stats.reclaimable++;
                            stats.rentValue += info.lamports;
                        } else {
                            row.status = 'SKIP'; row.reason = 'No Authority';
                        }
                    }
                } else {
                    row.status = 'SKIP'; row.reason = 'Not a Token Account';
                }
            } catch (e) {
                row.status = 'SKIP'; row.reason = 'Error';
            }
            currentResults.push(row);
        }

        dashboardData.results = currentResults;
        dashboardData.stats = stats;
        console.log("✅ Scan Complete. Waiting for user action.");

    } catch (e) {
        console.log("Scan Error:", e);
    }
}

// --- ACTION 2: RECLAIM (Write/Execute) ---
async function performReclaim() {
    console.log("🧹 Executing Reclaim...");
    
    // 1. INITIALIZE COUNTERS (This fixes your error)
    let reclaimedCount = 0;
    let reclaimedValue = 0;
    
    // Loop through the EXISTING results in memory
    for (let row of dashboardData.results) {
        if (row.canReclaim && row.status === 'READY') {
            try {
                const acc = new PublicKey(row.address);
                
                if (DRY_RUN) {
                    // Fake execution
                    await sleep(500);
                    row.status = 'RECLAIMED';
                    row.reason = '✅ SIMULATED RECLAIM';
                    
                    // Update counters
                    reclaimedCount++;
                    reclaimedValue += row.lamports;
                } else {
                    // Real execution
                    const tx = new Transaction().add(createCloseAccountInstruction(acc, operator.publicKey, operator.publicKey));
                    await sendAndConfirmTransaction(connection, tx, [operator]);
                    row.status = 'RECLAIMED';
                    row.reason = '✅ RECLAIMED (Tx Sent)';
                    
                    // Update counters
                    reclaimedCount++;
                    reclaimedValue += row.lamports;
                }
                
                // Disable button for this row logic
                row.canReclaim = false; 
            } catch (e) {
                row.status = 'ERROR';
                row.reason = 'Tx Failed';
            }
        }
    }

    // 2. SEND DISCORD ALERT (Now the variables exist!)
    if (reclaimedCount > 0) {
        const totalSaved = (reclaimedValue / 1e9).toFixed(4);
        console.log(`🎉 Successfully reclaimed ${totalSaved} SOL from ${reclaimedCount} accounts.`);
        
        // Call the Discord function we added
        await sendDiscordAlert(totalSaved, reclaimedCount);
    }

    // Reset stats after reclaim
    dashboardData.stats.reclaimable = 0; 
    console.log("✅ Reclaim Batch Complete.");
}

// --- ROUTES ---

app.get('/', (req, res) => {
    res.render('index', dashboardData);
});

// Button 1 Route
app.post('/scan', async (req, res) => {
    await performScan();
    res.redirect('/');
});

// Button 2 Route
app.post('/reclaim', async (req, res) => {
    await performReclaim();
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`\n🚀 Kora Dashboard is running at http://localhost:${PORT}`);
});