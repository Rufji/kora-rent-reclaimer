#!/usr/bin/env ts-node
import { argv } from 'process';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.RECLAIMER_DB || path.join(process.cwd(), 'reclaimer.db');
const db = new Database(DB_PATH);

async function main() {
  const id = argv[2];
  const cmd = argv[3] || 'approve';
  if (!id) return console.error('Usage: node scripts/approve-ata.ts <id> [approve|revoke]');
  if (cmd === 'approve') {
    db.prepare('UPDATE reclaims SET approved=1, approved_at=strftime("%s","now") WHERE id = ?').run(id);
    console.log('approved', id);
  } else {
    db.prepare('UPDATE reclaims SET approved=0 WHERE id = ?').run(id);
    console.log('revoked', id);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
