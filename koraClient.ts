import fetch from 'node-fetch';

const KORA_URL = process.env.KORA_URL;
const KORA_API_KEY = process.env.KORA_API_KEY;

if (!KORA_URL) {
  // Module can be imported safely even when KORA_URL is not set — callers should check.
}

function buildHeaders() {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (KORA_API_KEY) h.Authorization = `Bearer ${KORA_API_KEY}`;
  return h;
}

async function request(path: string, init: any = {}) {
  if (!KORA_URL) throw new Error('KORA_URL not configured');
  const url = `${KORA_URL.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { headers: buildHeaders(), ...init });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch (err) { /* ignore */ }
  if (!res.ok) throw new Error(`Kora error ${res.status}: ${text}`);
  return json ?? text;
}

export async function health() {
  try {
    const r = await request('/health');
    return { ok: true, body: r };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
}

export async function listSponsoredAccounts(operatorPubkey: string): Promise<string[]> {
  // Expect an array of base58 pubkeys from the remote Kora service
  const data = await request(`/operator/${operatorPubkey}/sponsored`);
  if (!Array.isArray(data)) throw new Error('Unexpected response from Kora:listSponsoredAccounts');
  return data;
}

export async function instructReclaim(accountPubkey: string) {
  // Tell the remote Kora node to perform a reclaim (optional)
  return request('/reclaim', { method: 'POST', body: JSON.stringify({ account: accountPubkey }) });
}

export default { health, listSponsoredAccounts, instructReclaim };
