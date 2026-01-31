#!/usr/bin/env ts-node
/**
 * CI smoke script: ensures basic repository invariants for PRs
 * - TypeScript compiles
 * - DB migration runs
 * - reclaimer.scanAndReclaim runs in dry-run mode
 */
import { execSync } from 'child_process';
import path from 'path';

console.log('1) TypeScript compile check');
execSync('npx tsc --noEmit', { stdio: 'inherit' });

console.log('\n2) DB migration');
execSync('npx ts-node scripts/db-migrate.ts', { stdio: 'inherit' });

console.log('\n3) Reclaimer dry-run smoke (imports module and runs scanAndReclaim)');
(async function main(){
  const R = await import('../src/kora-reclaimer');
  const { Keypair } = await import('@solana/web3.js');
  if (!process.env.OPERATOR_PRIVATE_KEY) {
    console.log('Skipping on-chain smoke: OPERATOR_PRIVATE_KEY not set in CI');
    process.exit(0);
  }
  const sec = Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY));
  const owner = Keypair.fromSecretKey(sec).publicKey.toBase58();
  const out = await R.scanAndReclaim({ dryRun: true, operator: { pubkey: owner } });
  console.log('smoke result:', JSON.stringify(out.report.map(r=>({ ata: r.ata, notes: r.row.notes })), null, 2));
  process.exit(0);
})();
