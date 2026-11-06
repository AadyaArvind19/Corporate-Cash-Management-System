import { z } from 'zod';
import { route, parse, readJson, id, money, ipOf } from '@/lib/http';
import { listCorridors, createCorridor } from '@/lib/services/reference';
import { audit } from '@/lib/audit';

const corridorFields = {
  feeFlat: money, feeCurrency: z.string().length(3).toUpperCase(),
  feePercent: z.string().regex(/^\d(\.\d{1,4})?$/, 'Percent with up to 4 decimals (max 5)'),
  latencyMinutes: z.coerce.number().int().min(1).max(100000)
};
const Create = z.object({ sourceBankId: id, destinationBankId: id, ...corridorFields });

export const GET = route({}, async () => listCorridors());
export const POST = route({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const b = parse(Create, await readJson(req));
  const corridorId = await createCorridor(b);
  await audit({ corpId: user.corpId, actor: user, action: 'CORRIDOR_CREATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'corridor', id: corridorId }, details: b });
  return { corridorId };
});
