
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import {
  getDriver,
  verifyConnectivity,
  connectivityStatus,
  closeDriver,
} from './db.js';
import accountsRouter from './routes/accounts.js';
import ringsRouter from './routes/rings.js';
import pathsRouter from './routes/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const config = loadConfig();
const app = express();

app.use(express.json({ limit: '256kb' }));
 
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});


app.get('/api/health', async (_req, res) => {
  const status = await verifyConnectivity();
  res.status(status.ok ? 200 : 503).json({
    ok: status.ok,
    db: status,
    uptime: process.uptime(),
  });
});

app.use('/api/accounts', accountsRouter);
app.use('/api/rings', ringsRouter);
app.use('/api/paths', pathsRouter);

// Static frontend
app.use(express.static(publicDir, { extensions: ['html'] }));

// SPA fallback for non-API routes
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});


app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal error';
  console.error('[unhandled]', err);
  res.status(status).json({ error: message });
});

const server = app.listen(config.port, async () => {
  await verifyConnectivity();
  const status = connectivityStatus();
  console.log(
    `wexa-fraud-graph listening on http://localhost:${config.port} — DB ${status.ok ? 'OK' : 'UNREACHABLE'}`,
  );
  if (!status.ok) {
      console.warn(`  ↳ ${status.message}`);
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);
  server.close(async () => {
    await closeDriver();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  getDriver();
} catch (err) {
  console.error('Failed to initialise Neo4j driver:', err.message);
  process.exit(1);
}