import express from 'express';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction, unpackAccount } from '@solana/spl-token';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// CONFIG
const app = express();
const PORT = 3000;
const DRY_RUN = process.env.DRY_RUN === 'true';
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

// HELPER: Flexible Discord Notification
async function sendDiscordAlert(title: string, description: string, color: number) {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) return;

    try {
        const body = {
            username: "Kora Janitor",
            embeds: [{
                title: title,
                description: description,
                color: color, // Color code (Decimal)
                footer: { text: "Automated Cleanup System" },
                timestamp: new Date().toISOString()
            }]
        };

        // Use standard fetch
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
    } catch (e) {
        console.error("❌ Failed to send Discord alert:", e);
    }
}
// GLOBAL STATE
let dataVersion = Date.now(); // <--- THIS IS THE MISSING VARIABLE
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
    
    // console.log("🔍 Scanning Blockchain...");

    try {
        const signatures = await connection.getSignaturesForAddress(operator.publicKey, { limit: 50 });
        let candidates: PublicKey[] = [];

        for (const sig of signatures) {
            if (sig.err) continue;
            await sleep(100); 
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
            await sleep(50);
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
        
        // UPDATE VERSION SO FRONTEND KNOWS TO REFRESH
        dataVersion = Date.now();
        
        console.log("✅ Scan Complete. Waiting for user action.");

    } catch (e) {
        console.log("Scan Error:", e);
    }
}

// --- ACTION 2: RECLAIM (Write/Execute) ---
async function performReclaim() {
    console.log("🧹 Executing Reclaim...");
    
    let reclaimedCount = 0;
    let reclaimedValue = 0;
    
    for (let row of dashboardData.results) {
        if (row.canReclaim && row.status === 'READY') {
            try {
                const acc = new PublicKey(row.address);
                
                if (DRY_RUN) {
                    await sleep(500);
                    row.status = 'RECLAIMED';
                    row.reason = '✅ SIMULATED RECLAIM';
                    reclaimedCount++;
                    reclaimedValue += row.lamports;
                } else {
                    const tx = new Transaction().add(createCloseAccountInstruction(acc, operator.publicKey, operator.publicKey));
                    await sendAndConfirmTransaction(connection, tx, [operator]);
                    row.status = 'RECLAIMED';
                    row.reason = '✅ RECLAIMED (Tx Sent)';
                    reclaimedCount++;
                    reclaimedValue += row.lamports;
                }
                row.canReclaim = false; 
            } catch (e) {
                row.status = 'ERROR';
                row.reason = 'Tx Failed';
            }
        }
    }

    if (reclaimedCount > 0) {
        const totalSaved = (reclaimedValue / 1e9).toFixed(4);
        console.log(`🎉 Successfully reclaimed ${totalSaved} SOL from ${reclaimedCount} accounts.`);

        // Green Alert (5763719) for Success
        await sendDiscordAlert(
            "💰 Money Reclaimed!", 
            `**Success!** Swept **${reclaimedCount}** accounts.\nRecovered: **${totalSaved} SOL**`, 
            5763719
        );
    }

    dashboardData.stats.reclaimable = 0; 
    
    // UPDATE VERSION HERE TOO
    dataVersion = Date.now();
    console.log("✅ Reclaim Batch Complete.");
}



// --- 🐕 AUTOMATION: PASSIVE WATCHDOG ---
const WATCHDOG_INTERVAL = 60000; 
let lastAlertCount = 0; // Memory to prevent spam

console.log("⏰ Watchdog: Passive monitoring started.");

setInterval(async () => {
    console.log(`\n[${new Date().toLocaleTimeString()}] 🔎 Watchdog checking history...`);
    
    // 1. Run the scan
    await performScan();
    
    // 2. Check results
    const readyCount = dashboardData.results.filter(r => r.status === 'READY').length;
    const potentialSol = (dashboardData.stats.rentValue / 1e9).toFixed(4);

    if (readyCount > 0) {
        console.log(`⚠️ Alert: Found ${readyCount} idle accounts!`);

        // ONLY alert if the number of accounts has changed (avoids spamming every minute)
        if (readyCount !== lastAlertCount) {
            // Yellow Alert (16776960) for Warnings/Discovery
            await sendDiscordAlert(
                "🔎 Opportunity Detected",
                `Found **${readyCount}** dormant accounts.\nPotential Value: **${potentialSol} SOL**\n\n*Go to dashboard to reclaim.*`,
                16776960
            );
            lastAlertCount = readyCount; // Update memory
        }
    } else {
        console.log("✅ Node status: Clean.");
        lastAlertCount = 0; // Reset memory if clean
    }
}, WATCHDOG_INTERVAL);

// --- ROUTES ---

// API Route for Frontend Auto-Refresh
app.get('/api/version', (req, res) => {
    res.json({ version: dataVersion });
});

app.get('/', (req, res) => {
    // IMPORTANT: WE PASS dataVersion HERE
    res.render('index', { ...dashboardData, dataVersion });
});

app.post('/scan', async (req, res) => {
    await performScan();
    res.redirect('/');
});

app.post('/reclaim', async (req, res) => {
    await performReclaim();
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`\n🚀 Kora Dashboard is running at http://localhost:${PORT}`);
});