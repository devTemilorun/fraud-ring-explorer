import { Router } from 'express';
import { withDriver } from '../db.js';
import { shortestAccountPath, neighborhood } from '../queries.js';

const router = Router();

// GET /api/paths?from=A-001&to=A-042
router.get('/', withDriver(async (req, res, session) => {
  const fromId = String(req.query.from ?? '').trim();
  const toId = String(req.query.to ?? '').trim();
  if (!fromId || !toId) {
    const err = new Error('Both `from` and `to` query params are required');
    err.status = 400;
    throw err;
  }
  const { text, params } = shortestAccountPath;
  const { records } = await session.run(text, params({ fromId, toId }));
  if (records.length === 0) return { nodes: [], rels: [], hops: null };
  const r = records[0];
  return {
    nodes: r.get('nodes'),
    rels: r.get('rels'),
    hops: r.get('hops'),
  };
}));

// GET /api/paths/neighborhood/:id?hops=2
router.get('/neighborhood/:id', withDriver(async (req, res, session) => {
  const rootId = String(req.params.id);
  const hops = Math.min(Math.max(Number.parseInt(req.query.hops ?? '2', 10) || 2, 1), 3);
  const { text, params } = neighborhood(hops);
  const { records } = await session.run(text, params({ rootId }));
  if (records.length === 0) return { nodes: [], edges: [] };
  const r = records[0];
  return { nodes: r.get('nodes'), edges: r.get('edges') };
}));

export default router;