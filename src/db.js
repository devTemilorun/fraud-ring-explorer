

import neo4j from 'neo4j-driver';
import { loadConfig } from './config.js';

const config = loadConfig();

let driver = null;
let lastConnectivity = { ok: false, checkedAt: null, message: 'not checked yet' };

export function getDriver() {
  if (!driver) {
    driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
      {
        maxConnectionPoolSize: 20,
        connectionAcquisitionTimeout: 15_000,
        disableLosslessIntegers: true,
      },
    );
  }
  return driver;
}

export async function verifyConnectivity() {
  try {
    await getDriver().verifyConnectivity();
    lastConnectivity = { ok: true, checkedAt: new Date().toISOString(), message: 'ok' };
  } catch (err) {
    lastConnectivity = {
      ok: false,
      checkedAt: new Date().toISOString(),
      message: sanitizeError(err),
    };
  }
  return lastConnectivity;
}

export function connectivityStatus() {
  return lastConnectivity;
}

export async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// Runs fn(session) 
export async function withSession(fn, { database = undefined } = {}) {
  const session = getDriver().session({ database });
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

// Express middleware wrapper
export function withDriver(fn) {
  return async (req, res) => {
    try {
      const result = await withSession((session) => fn(req, res, session));
      if (!res.headersSent) res.json(result);
    } catch (err) {
      const { status, body } = mapDriverError(err);
      if (!res.headersSent) res.status(status).json(body);
    }
  };
}

function mapDriverError(err) {
  const code = err?.code || '';
  const message = sanitizeError(err);

  // Client-side Cypher/semantic problems → 400
  if (code.startsWith('Neo.ClientError')) {
    return { status: 400, body: { error: 'Query error', code, message } };
  }
  // Transient / availability problems → 503
  if (code.startsWith('Neo.TransientError') || code.startsWith('ServiceUnavailable')) {
    return { status: 503, body: { error: 'Database unavailable', code, message } };
  }
  if (code === 'SessionExpired' || code === 'Neo.ClientError.Security.Unauthorized') {
    return { status: 502, body: { error: 'Database authentication failed', code, message } };
  }
  return { status: 500, body: { error: 'Internal error', code, message } };
}

// Strip anything that looks like a password if a driver ever echoed it back.
function sanitizeError(err) {
  const raw = err?.message ? String(err.message) : String(err);
  return raw.replace(/password=[^&\s]+/gi, 'password=***');
}
