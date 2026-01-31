import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple in-memory store — returns a short list for testing
const store: Record<string, string[]> = {};

app.all('/health', (req, res) => {
  console.log(`[mock-kora] /health ${req.method}`);
  res.json({ ok: true, method: req.method, now: Date.now() });
});
app.get('/operator/:op/sponsored', (req, res) => {
  const op = req.params.op;
  console.log(`[mock-kora] GET /operator/${op}/sponsored -> ${((store[op]||[]).length)} items`);
  res.json(store[op] || []);
});
app.post('/operator/:op/sponsored', (req, res) => {
  const op = req.params.op;
  store[op] = store[op] || [];
  if (req.body && req.body.ata) store[op].push(req.body.ata);
  console.log(`[mock-kora] POST /operator/${op}/sponsored <- ${req.body && req.body.ata}`);
  res.json({ ok: true });
});

app.post('/reclaim', (req, res) => {
  const { account } = req.body || {};
  if (!account) return res.status(400).json({ error: 'missing account' });
  // Return a fake txSig for testing
  res.json({ ok: true, txSig: `MOCK_TX_${account.slice(0,8)}_${Date.now()}` });
});

const PORT = process.env.MOCK_KORA_PORT || 8080;
app.listen(PORT, () => console.log(`Mock Kora server listening on http://localhost:${PORT}`));
