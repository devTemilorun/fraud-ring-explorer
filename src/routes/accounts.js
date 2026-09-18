import { Router } from 'express';
import { withDriver } from '../db.js';
import { listFlaggedAccounts, searchAccounts } from '../queries.js';

const router = Router();

router.get('/flagged', withDriver(async (req, res, session) => {
  const { text, params } = listFlaggedAccounts;
  const { records } = await session.run(text, params({ limit: 50 }));
  return { items: records.map(toAccount) };
}));

router.get('/search', withDriver(async (req, res, session) => {
  const q = String(req.query.q ?? '').slice(0, 64);
  const { text, params, timeoutMs } = searchAccounts;
  const { records } = await session.run(text, params({ q, limit: 25 }), { timeout: timeoutMs });
  return { items: records.map(toAccount) };
}));

function toAccount(rec) {
  return {
    id: rec.get('id'),
    number: rec.get('number'),
    balance: rec.get('balance'),
    flagged: rec.get('flagged') ?? false,
    openedAt: rec.get('openedAt') ?? null,
    owners: rec.get('owners') ?? [],
  };
}

export default router;