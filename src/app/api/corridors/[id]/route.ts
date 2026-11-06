import { z } from 'zod';
import { route, parse, readJson, id, money, ApiError, ipOf } from '@/lib/http';
import { updateCorridor, deleteCorridor } from '@/lib/services/reference';
import { audit } from '@/lib/audit';

type P = { id: string };
const Patch = z.object({
  feeFlat: money.optional(), feeCurrency: z.string().length(3).toUpperCase().optional(),
  feePercent: z.string().regex(/^\d(\.\d{1,4})?$/).optional(), latencyMinutes: z.coerce.number().int().min(1).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional()
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const PATCH = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const cid = parse(id, params.id); const b = parse(Patch, await readJson(req));
  if (!(await updateCorridor(cid, b))) throw new ApiError(404, 'Corridor not found');
  await audit({ corpId: user.corpId, actor: user, action: 'CORRIDOR_UPDATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'corridor', id: cid }, details: b });
  return { ok: true };
});
export const DELETE = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const cid = parse(id, params.id);
  if (!(await deleteCorridor(cid))) throw new ApiError(404, 'Corridor not found');
  await audit({ corpId: user.corpId, actor: user, action: 'CORRIDOR_DELETED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'corridor', id: cid } });
  return { ok: true };
});
