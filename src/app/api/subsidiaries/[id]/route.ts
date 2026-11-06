import { z } from 'zod';
import { route, parse, readJson, id, ApiError, ipOf } from '@/lib/http';
import { updateSubsidiary, deleteSubsidiary } from '@/lib/services/reference';
import { audit } from '@/lib/audit';

type P = { id: string };
const Body = z.object({ name: z.string().trim().min(2).max(150), country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/) });
export const PATCH = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const sid = parse(id, params.id); const b = parse(Body, await readJson(req));
  if (!(await updateSubsidiary(user.corpId, sid, b.name, b.country))) throw new ApiError(404, 'Subsidiary not found');
  await audit({ corpId: user.corpId, actor: user, action: 'SUBSIDIARY_UPDATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'subsidiary', id: sid }, details: b });
  return { ok: true };
});
export const DELETE = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const sid = parse(id, params.id);
  if (!(await deleteSubsidiary(user.corpId, sid))) throw new ApiError(404, 'Subsidiary not found');
  await audit({ corpId: user.corpId, actor: user, action: 'SUBSIDIARY_DELETED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'subsidiary', id: sid } });
  return { ok: true };
});
