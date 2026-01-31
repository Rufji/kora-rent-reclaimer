import fetch from 'node-fetch';
import { PublicKey } from '@solana/web3.js';

const KORA_URL = process.env.KORA_URL;
const KORA_API_KEY = process.env.KORA_API_KEY;

function headers() {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (KORA_API_KEY) h.Authorization = `Bearer ${KORA_API_KEY}`;
  return h;
}

async function listSponsored(operator: string): Promise<string[]> {
  if (!KORA_URL) throw new Error('KORA_URL not set');
  const res = await fetch(`${KORA_URL.replace(/\/$/, '')}/operator/${operator}/sponsored`, { headers: headers() });
  if (!res.ok) throw new Error(`Kora listSponsored failed: ${res.status}`);
  return (await res.json()) as string[];
}

async function health() {
  if (!KORA_URL) return { ok: false, error: 'KORA_URL not set' };
  try {
    const res = await fetch(`${KORA_URL.replace(/\/$/, '')}/health`, { headers: headers() });
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
}

async function instructReclaim(account: PublicKey | string) {
  if (!KORA_URL) throw new Error('KORA_URL not set');
  const res = await fetch(`${KORA_URL.replace(/\/$/, '')}/reclaim`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ account: account.toString() }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kora instructReclaim failed: ${res.status} ${text}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    return { result: text };
  }
}

export default { listSponsored, health, instructReclaim };
