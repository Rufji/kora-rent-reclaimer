#!/usr/bin/env ts-node
import Database from 'better-sqlite3';
import path from 'path';
const DB_PATH = process.env.RECLAIMER_DB || path.join(process.cwd(), 'reclaimer.db');
const db = new Database(DB_PATH);

const cols = db.prepare("PRAGMA table_info('reclaims')").all().map((r:any)=>r.name);
const want = [
  ['dry_run_count','INTEGER DEFAULT 0'],
  ['approved','INTEGER DEFAULT 0'],
  ['approved_at','INTEGER'],
  ['last_reclaimed_at','INTEGER DEFAULT 0']
];
for (const [name, def] of want) {
  if (!cols.includes(name)) {
    console.log('adding', name);
    try { db.prepare(`ALTER TABLE reclaims ADD COLUMN ${name} ${def}`).run(); } catch (err) { console.warn('failed add', name, String(err)); }
  } else {
    console.log('exists', name);
  }
}
console.log('migration complete');
