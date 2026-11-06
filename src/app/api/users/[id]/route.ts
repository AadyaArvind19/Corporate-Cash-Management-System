import { z } from 'zod';
import { route, parse, readJson, id, ApiError, ipOf } from '@/lib/http';
import { updateUser, deleteUser } from '@/lib/services/users';
import { audit } from '@/lib/audit';

type P = { id: string };
const strong = z.string().min(10).max(100).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/, 'Password needs 10+ chars with upper, lower and digit');
const Patch = z.object({
  role: z.enum(['ADMIN', 'TREASURER', 'ANALYST']).optional(), isActive: z.boolean().optional(),
  password: strong.optional(), fullName: z.string().trim().min(2).max(120).optional()
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const PATCH = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const uid = parse(id, params.id); const b = parse(Patch, await readJson(req));
  if (!(await updateUser(user.corpId, user.userId, uid, b))) throw new ApiError(404, 'User not found');
  await audit({ corpId: user.corpId, actor: user, action: 'USER_UPDATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'user', id: uid }, details: { ...b, password: b.password ? '[changed]' : undefined } });
  return { ok: true };
});
export const DELETE = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const uid = parse(id, params.id);
  if (!(await deleteUser(user.corpId, user.userId, uid))) throw new ApiError(404, 'User not found');
  await audit({ corpId: user.corpId, actor: user, action: 'USER_DELETED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'user', id: uid } });
  return { ok: true };
});
