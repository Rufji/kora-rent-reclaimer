#!/usr/bin/env ts-node
import Database from 'better-sqlite3';
import path from 'path';
const DB_PATH = process.env.RECLAIMER_DB || path.join(process.cwd(), 'reclaimer.db');
const db = new Database(DB_PATH);

const rows = db.prepare('SELECT id, owner, ata, dry_run_count, approved, notes, created_at FROM reclaims WHERE approved = 0 ORDER BY dry_run_count DESC, created_at DESC LIMIT 200').all();
if (!rows || rows.length === 0) console.log('No pending approvals');
else console.table(rows.map(r=>({ id: r.id, owner: r.owner, ata: r.ata, dry_run_count: r.dry_run_count, notes: r.notes })));
