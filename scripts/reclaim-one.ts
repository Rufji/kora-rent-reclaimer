#!/usr/bin/env ts-node
import Reclaimer, { register as registerRow } from '../src/kora-reclaimer';

// Minimal argv parser to avoid extra compile-time types in scripts
function getFlag(name: string) {
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) return true;
  return val;
}

const argv: any = {
  ata: getFlag('ata') || process.env.ATA,
  owner: getFlag('owner') || null,
  id: getFlag('id') || null,
  register: !!getFlag('register'),
  run: !!getFlag('run')
};

async function main() {
  if (argv.register) {
    registerRow({ id: argv.id || argv.ata, owner: argv.owner || 'unknown', ata: argv.ata });
    console.log('Registered', argv.ata);
    return;
  }

  // derive operator pubkey from private key if not set
  if (!process.env.OPERATOR_PUBLIC_KEY && process.env.OPERATOR_PRIVATE_KEY) {
    try {
      const sec = Uint8Array.from(JSON.parse(process.env.OPERATOR_PRIVATE_KEY));
      const { Keypair } = await import('@solana/web3.js');
      process.env.OPERATOR_PUBLIC_KEY = Keypair.fromSecretKey(sec as any).publicKey.toBase58();
    } catch (e) {
      /* ignore */
    }
  }

  const res = await Reclaimer.scanAndReclaim({ dryRun: !argv.run, operator: { pubkey: process.env.OPERATOR_PUBLIC_KEY } });
  console.log(JSON.stringify(res, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
