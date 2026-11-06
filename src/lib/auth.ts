import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { cache } from 'react';
import bcrypt from 'bcryptjs';
import { env } from './env';
import { one } from './db';

export type Role = 'ADMIN' | 'TREASURER' | 'ANALYST';

export type CurrentUser = {
  userId: number;
  corpId: number;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  corpName: string;
  baseCurrency: string;
};

export const SESSION_COOKIE = 'ccms_session';
const SESSION_HOURS = 8;
const key = () => new TextEncoder().encode(env.sessionSecret);

export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function setSessionCookie(userId: number) {
  const token = await createSessionToken(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env.cookieSecure, path: '/', maxAge: SESSION_HOURS * 3600
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Re-reads the user from PostgreSQL on every request so deactivation / role changes apply at once. */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let uid: number;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    uid = Number(payload.uid);
  } catch { return null; }
  const row = await one<any>(
    `SELECT u.user_id, u.corp_id, u.username, u.full_name, u.email, u.role, c.legal_name, c.base_currency
       FROM users u JOIN corporations c ON c.corp_id = u.corp_id
      WHERE u.user_id = $1 AND u.is_active`, [uid]);
  if (!row) return null;
  return {
    userId: row.user_id, corpId: row.corp_id, username: row.username, fullName: row.full_name,
    email: row.email, role: row.role, corpName: row.legal_name, baseCurrency: row.base_currency.trim()
  };
});

// Compared against when the username is unknown so response time does not reveal whether it exists.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(crypto.randomUUID(), 12));

export async function verifyCredentials(username: string, password: string): Promise<{ userId: number } | null> {
  const row = await one<{ user_id: number; password_hash: string }>(
    `SELECT user_id, password_hash FROM users WHERE lower(username) = lower($1) AND is_active`, [username]);
  const ok = await bcrypt.compare(password, row?.password_hash ?? (await getDummyHash()));
  return row && ok ? { userId: row.user_id } : null;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

export const can = {
  manageStructure: (r: Role) => r === 'ADMIN',
  manageUsers: (r: Role) => r === 'ADMIN',
  viewAudit: (r: Role) => r === 'ADMIN',
  operate: (r: Role) => r === 'ADMIN' || r === 'TREASURER'   // execute sweeps, post balances, add rates
};
