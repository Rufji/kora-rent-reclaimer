import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  unpackAccount,
  createCloseAccountInstruction,
  AccountLayout,
} from '@solana/spl-token';
import * as dotenv from 'dotenv';
import KoraAdapter from './kora-adapter';

dotenv.config();

const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const DB_PATH = process.env.RECLAIMER_DB || path.join(process.cwd(), 'reclaimer.db');
const DRY_BY_DEFAULT = process.env.DRY_RUN !== 'false';

// Safety / policy defaults (configurable via ENV)
const DAILY_LAMPORT_LIMIT = Number(process.env.DAILY_LAMPORT_LIMIT || 2e9); // 2 SOL default per day
const PER_RUN_ACCOUNT_LIMIT = Number(process.env.PER_RUN_ACCOUNT_LIMIT || 50);
const MIN_DRY_RUNS_FOR_AUTO = Number(process.env.MIN_DRY_RUNS_FOR_AUTO || 2);
const REQUIRE_APPROVAL_FOR_AUTO = (process.env.REQUIRE_APPROVAL_FOR_AUTO || 'true') === 'true';


if (!fs.existsSync(path.dirname(DB_PATH))) {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch (e) { /* ignore */ }
}

const db = new Database(DB_PATH);

function init() {
  db.pragma('journal_mode = WAL');
  db.prepare(
    `CREATE TABLE IF NOT EXISTS reclaims (
      id TEXT PRIMARY KEY,
      owner TEXT,
      ata TEXT,
      mint TEXT,
      created_tx TEXT,
      reclaim_reason TEXT,
      simulated_ok INTEGER DEFAULT 0,
      dry_run_count INTEGER DEFAULT 0,
      approved INTEGER DEFAULT 0,
      approved_at INTEGER,
      reclaimed_tx TEXT,
      reclaimed_lamports INTEGER DEFAULT 0,
      last_reclaimed_at INTEGER DEFAULT 0,
      operator_id TEXT,
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`
  ).run();
}

init();

// Ensure any later schema additions exist (idempotent)
function ensureColumns() {
  const cols = db.prepare("PRAGMA table_info('reclaims')").all().map((r: any) => r.name);
  const want = [
    ['dry_run_count','INTEGER DEFAULT 0'],
    ['approved','INTEGER DEFAULT 0'],
    ['approved_at','INTEGER'],
    ['last_reclaimed_at','INTEGER DEFAULT 0']
  ];
  for (const [name, def] of want) {
    if (!cols.includes(name)) {
      try {
        db.prepare(`ALTER TABLE reclaims ADD COLUMN ${name} ${def}`).run();
      } catch (e) {
        // ignore failures on concurrent runs
      }
    }
  }
}
ensureColumns();


type RegisterOpts = { id: string; owner: string; ata: string; mint?: string; created_tx?: string; operator_id?: string };
export function register(opts: RegisterOpts) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO reclaims (id, owner, ata, mint, created_tx, operator_id, created_at) VALUES (@id,@owner,@ata,@mint,@created_tx,@operator_id,strftime('%s','now'))`
  );
  const params = { id: opts.id, owner: opts.owner, ata: opts.ata, mint: opts.mint || null, created_tx: opts.created_tx || null, operator_id: opts.operator_id || null };
  stmt.run(params);
  return params;
}

function auditRow(row: any) {
  const stmt = db.prepare(
    `UPDATE reclaims SET reclaim_reason=@reclaim_reason, simulated_ok=@simulated_ok, reclaimed_tx=@reclaimed_tx, reclaimed_lamports=@reclaimed_lamports, notes=@notes WHERE id=@id`
  );
  stmt.run(row);
}

async function analyzeAccount(connection: Connection, accountPubkey: PublicKey) {
  const info = await connection.getAccountInfo(accountPubkey);
  if (!info) return { status: 'CLOSED', lamports: 0, reason: 'Account does not exist' };
  if (info.lamports === 0) return { status: 'CLOSED', lamports: 0, reason: 'Already empty' };

  // Try to detect token account
  try {
    const data = unpackAccount(accountPubkey, info, TOKEN_PROGRAM_ID);
    if (data.amount > BigInt(0)) return { status: 'SKIP', lamports: info.lamports, reason: 'Has Token Balance' };
    const isCloseAuth = data.closeAuthority ? data.closeAuthority.equals(new PublicKey(process.env.OPERATOR_PUBLIC_KEY || '11111111111111111111111111111111')) : data.owner.equals(new PublicKey(process.env.OPERATOR_PUBLIC_KEY || '11111111111111111111111111111111'));
    if (isCloseAuth) return { status: 'RECLAIM', lamports: info.lamports, reason: 'Empty & Auth Held' };
    return { status: 'SKIP', lamports: info.lamports, reason: 'No Close Authority' };
  } catch (e) {
    return { status: 'SKIP', lamports: info.lamports, reason: 'Not a Token Account' };
  }
}

export async function scanAndReclaim(opts: { dryRun?: boolean; operator?: { keypair?: any; pubkey?: string } } = {}) {
  const dryRun = opts.dryRun ?? DRY_BY_DEFAULT;
  const connection = new Connection(RPC, 'confirmed');
  const operatorPub = opts.operator?.pubkey || process.env.OPERATOR_PUBLIC_KEY;
  if (!operatorPub) throw new Error('operator pubkey required in env or opts');

  // 1. Gather candidates from DB + optional Kora service
  const registered = db.prepare('SELECT * FROM reclaims ORDER BY created_at DESC LIMIT 1000').all();
  let candidates: { ata: string; id: string }[] = registered.map((r: any) => ({ ata: r.ata, id: r.id }));

  if (process.env.KORA_URL) {
    try {
      const list = await KoraAdapter.listSponsored(operatorPub);
      for (const ata of list) {
        const id = ata; // default id
        const exists = candidates.find(c => c.ata === ata);
        if (!exists) candidates.push({ ata, id });
      }
    } catch (err) {
      // ignore
    }
  }

  

  const report: any[] = [];
  for (const c of candidates) {
    const ata = new PublicKey(c.ata);
    const analysis = await analyzeAccount(connection, ata);

    const row: any = { id: c.id, ata: c.ata, reclaim_reason: analysis.reason, simulated_ok: 0, reclaimed_tx: null, reclaimed_lamports: 0, notes: '' };

    if (analysis.status === 'RECLAIM') {
      // simulate: build tx and (if not dry) send or ask Kora
      try {
        // Simulation phase: ensure instruction can be built
        const tx = new Transaction().add(createCloseAccountInstruction(ata, new PublicKey(process.env.OPERATOR_PUBLIC_KEY!), new PublicKey(process.env.OPERATOR_PUBLIC_KEY!)));
        row.simulated_ok = 1;

        if (dryRun) {
          row.notes = `would-close +${(analysis.lamports / 1e9).toFixed(6)} SOL`;
          try {
            db.prepare('UPDATE reclaims SET dry_run_count = COALESCE(dry_run_count,0) + 1, reclaim_reason=@reclaim_reason WHERE id = @id').run({ id: c.id, reclaim_reason: row.reclaim_reason });
          } catch (e) { /* best-effort */ }
        } else {
          // --- SAFETY GUARDS BEFORE PERFORMING A LIVE RECLAIM ---
          const meta = db.prepare('SELECT dry_run_count, approved, owner FROM reclaims WHERE id = ?').get(c.id) || { dry_run_count: 0, approved: 0, owner: null };

          // Orphan protection
          if (!meta.owner) {
            row.notes = 'blocked: orphan account - manual review required';
            auditRow(row);
            report.push({ ata: c.ata, analysis, row });
            continue;
          }

          if (REQUIRE_APPROVAL_FOR_AUTO && meta.approved !== 1) {
            row.notes = 'blocked: requires operator approval';
            auditRow(row);
            report.push({ ata: c.ata, analysis, row });
            continue;
          }

          if (meta.dry_run_count < MIN_DRY_RUNS_FOR_AUTO) {
            row.notes = `blocked: requires >=${MIN_DRY_RUNS_FOR_AUTO} successful dry-runs (have=${meta.dry_run_count})`;
            auditRow(row);
            report.push({ ata: c.ata, analysis, row });
            continue;
          }

          // Per-run + daily budget enforcement
          const claimedToday = db.prepare("SELECT COALESCE(SUM(reclaimed_lamports),0) as s FROM reclaims WHERE reclaimed_lamports > 0 AND last_reclaimed_at > strftime('%s','now') - 86400").get().s || 0;
          const reclaimsThisRun = db.prepare('SELECT COUNT(*) as c FROM reclaims WHERE last_reclaimed_at > strftime(\"%s\",\'now\') - 86400').get().c || 0;

          if (reclaimsThisRun >= PER_RUN_ACCOUNT_LIMIT) {
            row.notes = 'blocked: per-run account limit reached';
            auditRow(row);
            report.push({ ata: c.ata, analysis, row });
            continue;
          }

          if ((claimedToday + analysis.lamports) > DAILY_LAMPORT_LIMIT) {
            row.notes = 'blocked: daily reclaim budget would be exceeded';
            auditRow(row);
            report.push({ ata: c.ata, analysis, row });
            continue;
          }

          if (process.env.KORA_URL && process.env.KORA_REMOTE_EXECUTE === 'true') {
            try {
              const resp = await KoraAdapter.instructReclaim(ata);
              row.reclaimed_tx = resp.txSig || JSON.stringify(resp);
              row.reclaimed_lamports = analysis.lamports;
              row.notes = 'remote-executed';
              db.prepare('UPDATE reclaims SET reclaimed_tx=@reclaimed_tx, reclaimed_lamports=@reclaimed_lamports, last_reclaimed_at=strftime("%s","now") WHERE id=@id').run({ id: c.id, reclaimed_tx: row.reclaimed_tx, reclaimed_lamports: row.reclaimed_lamports });
            } catch (err) {
              row.notes = `remote-failed: ${String(err)}`;
            }
          } else {
            const secret = process.env.OPERATOR_PRIVATE_KEY ? Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY)) : null;
            if (!secret) {
              row.notes = 'blocked: OPERATOR_PRIVATE_KEY required for local reclaim';
              auditRow(row);
              report.push({ ata: c.ata, analysis, row });
              continue;
            }
            const kp = (await import('@solana/web3.js')).Keypair.fromSecretKey(secret as any);
            const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
            row.reclaimed_tx = sig;
            row.reclaimed_lamports = analysis.lamports;
            row.notes = 'local-executed';
            db.prepare('UPDATE reclaims SET reclaimed_tx=@reclaimed_tx, reclaimed_lamports=@reclaimed_lamports, last_reclaimed_at=strftime("%s","now") WHERE id=@id').run({ id: c.id, reclaimed_tx: row.reclaimed_tx, reclaimed_lamports: row.reclaimed_lamports });
          }
        }
      } catch (err: any) {
        row.notes = `simulation-failed: ${String(err)}`;
      }
    } else {
      // non-reclaimable
      row.notes = `skipped:${analysis.reason}`;
    }

    auditRow(row);
    report.push({ ata: c.ata, analysis, row });
  }

  return { dryRun, report };
}

export function exportCSV(sinceSeconds = 86400) {
  const rows = db.prepare("SELECT * FROM reclaims WHERE created_at > strftime('%s','now') - ?").all(sinceSeconds);
  const csv = ['id,owner,ata,mint,created_tx,reclaim_reason,simulated_ok,dry_run_count,approved,reclaimed_tx,reclaimed_lamports,operator_id,created_at'];
  for (const r of rows) csv.push(`${r.id},${r.owner},${r.ata},${r.mint},${r.created_tx},${r.reclaim_reason},${r.simulated_ok},${r.dry_run_count || 0},${r.approved || 0},${r.reclaimed_tx},${r.reclaimed_lamports},${r.operator_id},${r.created_at}`);
  return csv.join('\n');
}

export function approve(id: string, operator_id?: string) {
  const stmt = db.prepare('UPDATE reclaims SET approved=1, approved_at=strftime("%s","now"), operator_id=@operator_id WHERE id=@id');
  stmt.run({ id, operator_id: operator_id || null });
  return db.prepare('SELECT * FROM reclaims WHERE id = ?').get(id);
}

export function revoke(id: string) {
  db.prepare('UPDATE reclaims SET approved=0 WHERE id=@id').run({ id });
  return db.prepare('SELECT * FROM reclaims WHERE id = ?').get(id);
}

export function listReclaims(limit = 1000) {
  return db.prepare('SELECT * FROM reclaims ORDER BY created_at DESC LIMIT ?').all(limit);
}

export default { register, scanAndReclaim, exportCSV, approve, revoke, listReclaims };
