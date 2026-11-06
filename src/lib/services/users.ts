import { query, withTx } from '../db';
import { hashPassword, Role } from '../auth';
import { ApiError } from '../http';

export const listUsers = (corpId: number) =>
  query(`SELECT user_id, username, full_name, email, role, is_active, last_login_at, created_at
           FROM users WHERE corp_id = $1 ORDER BY is_active DESC, role, username`, [corpId]);

export async function createUser(corpId: number, u: { username: string; fullName: string; email: string; password: string; role: Role }) {
  const hash = await hashPassword(u.password);
  const r = await query(
    `INSERT INTO users (corp_id, username, full_name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING user_id`,
    [corpId, u.username.toLowerCase(), u.fullName, u.email, hash, u.role]);
  return r[0].user_id as number;
}

/** Ensures at least one active administrator remains and that admins cannot lock themselves out. */
async function guardAdmins(c: any, corpId: number, targetId: number, selfId: number, willRemainAdmin: boolean) {
  if (targetId === selfId && !willRemainAdmin) throw new ApiError(409, 'You cannot remove your own administrator access');
  if (!willRemainAdmin) {
    const r = await c.query(`SELECT count(*)::int AS n FROM users WHERE corp_id = $1 AND role = 'ADMIN' AND is_active AND user_id <> $2`, [corpId, targetId]);
    if (r.rows[0].n === 0) throw new ApiError(409, 'At least one active administrator is required');
  }
}

export async function updateUser(corpId: number, selfId: number, id: number, p: { role?: Role; isActive?: boolean; password?: string; fullName?: string }) {
  return withTx(async (c) => {
    const cur = await c.query(`SELECT role, is_active FROM users WHERE corp_id = $1 AND user_id = $2 FOR UPDATE`, [corpId, id]);
    if (!cur.rows[0]) return false;
    const role = p.role ?? cur.rows[0].role; const active = p.isActive ?? cur.rows[0].is_active;
    await guardAdmins(c, corpId, id, selfId, role === 'ADMIN' && active);
    const sets: string[] = []; const params: unknown[] = [];
    const add = (col: string, v: unknown, cast = '') => { params.push(v); sets.push(`${col} = $${params.length}${cast}`); };
    if (p.role !== undefined) add('role', p.role, '::user_role');
    if (p.isActive !== undefined) add('is_active', p.isActive);
    if (p.fullName !== undefined) add('full_name', p.fullName);
    if (p.password !== undefined) add('password_hash', await hashPassword(p.password));
    if (!sets.length) return true;
    params.push(corpId, id);
    await c.query(`UPDATE users SET ${sets.join(', ')} WHERE corp_id = $${params.length - 1} AND user_id = $${params.length}`, params);
    return true;
  });
}

export async function deleteUser(corpId: number, selfId: number, id: number) {
  return withTx(async (c) => {
    const cur = await c.query(`SELECT role, is_active FROM users WHERE corp_id = $1 AND user_id = $2 FOR UPDATE`, [corpId, id]);
    if (!cur.rows[0]) return false;
    await guardAdmins(c, corpId, id, selfId, false);
    await c.query(`DELETE FROM users WHERE corp_id = $1 AND user_id = $2`, [corpId, id]);
    return true;
  });
}

export const touchLogin = (userId: number) => query(`UPDATE users SET last_login_at = now() WHERE user_id = $1`, [userId]);
