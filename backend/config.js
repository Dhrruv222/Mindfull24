const env = process.env;

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

// Hosted databases (e.g. Supabase) need TLS; local ones do not. DB_SSL=true/false overrides the guess.
function sslSetting(url, override) {
  const enabled = override ? override === 'true' : !/@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  if (!enabled) return false;
  // Supply the Supabase CA certificate (PEM) in DB_SSL_CA to also verify the server identity.
  return process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : { rejectUnauthorized: false };
}

const databaseUrl = env.DATABASE_URL || 'postgresql://saca:saca_pw@127.0.0.1:5544/saca';

const nodeEnv = env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// In production a missing database URL or weak JWT secret is reported as 503 instead of crashing the function.
const missing = [];
if (isProduction && !env.DATABASE_URL) missing.push('DATABASE_URL');
if (isProduction && (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.startsWith('change-me'))) missing.push('JWT_SECRET (min 32 characters)');

module.exports = {
  nodeEnv,
  isProduction,
  missing,
  port: int(env.PORT, 3000),
  jwtSecret: env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '12h',
  bcryptRounds: int(env.BCRYPT_ROUNDS, 10),
  db: {
    // Supabase: Project Settings > Database > Connection string (use the pooler URL if IPv6 is unavailable).
    url: databaseUrl,
    ssl: sslSetting(databaseUrl, env.DB_SSL),
    // Serverless instances stay small; the Supabase pooler multiplexes the real connections.
    poolMax: int(env.DB_POOL_MAX, env.VERCEL ? 3 : 10),
  },
  // The tier switcher is only available when this is on (never in production by default).
  demoMode: env.DEMO_MODE ? env.DEMO_MODE === 'true' : !isProduction,
  randomizer: {
    freeCooldownMinutes: int(env.RANDOMIZER_COOLDOWN_MINUTES, 60),
    premiumCooldownMinutes: int(env.RANDOMIZER_PREMIUM_COOLDOWN_MINUTES, 15),
  },
  // Failed logins allowed per email within the window before it is temporarily locked.
  loginMaxFailures: int(env.LOGIN_MAX_FAILURES, 10),
  authRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: int(env.AUTH_RATE_LIMIT_MAX, 30),
  },
};
