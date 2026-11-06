import { z } from 'zod';
import { NextResponse } from 'next/server';
import { route, parse, readJson, ApiError, ipOf } from '@/lib/http';
import { verifyCredentials, setSessionCookie } from '@/lib/auth';
import { one } from '@/lib/db';
import { touchLogin } from '@/lib/services/users';
import { audit } from '@/lib/audit';

// Simple in-memory throttle: 5 failures / 15 min per username+IP.
const fails = new Map<string, { n: number; first: number }>();
const WINDOW = 15 * 60_000, MAX = 5;

const Body = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });

export const POST = route({ public: true }, async ({ req }) => {
  const { username, password } = parse(Body, await readJson(req));
  const key = `${username.toLowerCase()}|${ipOf(req)}`;
  const f = fails.get(key);
  if (f && Date.now() - f.first < WINDOW && f.n >= MAX) throw new ApiError(429, 'Too many failed attempts. Try again in a few minutes.');

  const row = await one<{ user_id: number; corp_id: number; role: any; username: string }>(
    `SELECT user_id, corp_id, role, username FROM users WHERE lower(username) = lower($1)`, [username]);
  const ok = await verifyCredentials(username, password);
  if (!ok || !row) {
    const cur = f && Date.now() - f.first < WINDOW ? f : { n: 0, first: Date.now() };
    cur.n++; fails.set(key, cur);
    if (row) await audit({ corpId: row.corp_id, action: 'AUTH_LOGIN', outcome: 'FAILURE', ip: ipOf(req), details: { username: row.username } });
    throw new ApiError(401, 'Invalid username or password');
  }
  fails.delete(key);
  await setSessionCookie(ok.userId);
  await touchLogin(ok.userId);
  await audit({ corpId: row.corp_id, actor: { userId: row.user_id, username: row.username, role: row.role }, action: 'AUTH_LOGIN', outcome: 'SUCCESS', ip: ipOf(req) });
  return NextResponse.json({ ok: true });
});
