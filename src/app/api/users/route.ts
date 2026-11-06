import { z } from 'zod';
import { route, parse, readJson, ipOf } from '@/lib/http';
import { listUsers, createUser } from '@/lib/services/users';
import { audit } from '@/lib/audit';

const strongPassword = z.string().min(10, 'At least 10 characters').max(100)
  .regex(/[a-z]/, 'Needs a lowercase letter').regex(/[A-Z]/, 'Needs an uppercase letter').regex(/\d/, 'Needs a digit');
const Body = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, '3-40 chars: a-z 0-9 . _ -'),
  fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160),
  password: strongPassword, role: z.enum(['ADMIN', 'TREASURER', 'ANALYST'])
});
export const GET = route({ roles: ['ADMIN'] }, async ({ user }) => listUsers(user.corpId));
export const POST = route({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const b = parse(Body, await readJson(req));
  const userId = await createUser(user.corpId, b);
  await audit({ corpId: user.corpId, actor: user, action: 'USER_CREATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'user', id: userId }, details: { username: b.username, role: b.role } });
  return { userId };
});
