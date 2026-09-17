

import 'dotenv/config';

function readEnv(name, { required = true, fallback = undefined } = {}) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (required) throw new Error(`Missing required environment variable: ${name}`);
    return fallback;
  }
  return value;
}

export function loadConfig({ soft = false } = {}) {
  try {
    return {
      uri: readEnv('COGNODB_URI'),
      user: readEnv('COGNODB_USER'),
      password: readEnv('COGNODB_PASSWORD'),
      port: Number(readEnv('PORT', { required: false, fallback: '8080' })),
      nodeEnv: readEnv('NODE_ENV', { required: false, fallback: 'development' }),
      seedPeople: Number(readEnv('SEED_PEOPLE', { required: false, fallback: '120' })),
      seedAccounts: Number(readEnv('SEED_ACCOUNTS', { required: false, fallback: '180' })),
    };
  } catch (err) {
    if (soft) return null;
    throw err;
  }
}
