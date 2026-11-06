// Central, lazy access to configuration. Nothing sensitive is hard-coded: every value comes from
// the environment (see .env.example). Access is lazy so `next build` does not need secrets.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return required('DATABASE_URL'); },
  get mongoUri() { return required('MONGODB_URI'); },
  get mongoDb() { return process.env.MONGODB_DB || 'ccms'; },
  get sessionSecret() {
    const v = required('SESSION_SECRET');
    if (v.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
    return v;
  },
  get cookieSecure() { return process.env.COOKIE_SECURE === 'true'; }
};
