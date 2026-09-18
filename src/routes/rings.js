import { Router } from 'express';
import { withDriver } from '../db.js';
import { ringsAroundFlaggedAccount, topConnectorsInRing } from '../queries.js';

const router = Router();

// GET /api/rings?limit=200
router.get('/', withDriver(async (req, res, session) => {
  const limit = clampInt(req.query.limit, 200, 1, 1000);
  const { text, params } = ringsAroundFlaggedAccount;
  const { records } = await session.run(text, params({ limit }));
  return {
    items: records.map((r) => ({
      flaggedId: r.get('flaggedId'),
      otherId: r.get('otherId'),
      hops: r.get('hops'),
      personIds: r.get('personIds'),
      addressIds: r.get('addressIds'),
      phoneIds: r.get('phoneIds'),
    })),
  };
}));

// GET /api/rings/connectors
router.get('/connectors', withDriver(async (req, res, session) => {
  const { text, params } = topConnectorsInRing;
  const { records } = await session.run(text, params({ limit: 25 }));
  return {
    items: records.map((r) => ({
      id: r.get('id'),
      name: r.get('name'),
      riskScore: r.get('riskScore'),
      directFlagged: r.get('directFlagged'),
      indirectFlagged: r.get('indirectFlagged'),
      score: r.get('score'),
    })),
  };
}));

function clampInt(v, dflt, min, max) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(Math.max(n, min), max);
}

export default router;
