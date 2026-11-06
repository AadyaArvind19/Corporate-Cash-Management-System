import { z } from 'zod';
import { route, parse, readJson, ipOf } from '@/lib/http';
import { latestRates, addRate } from '@/lib/services/reference';
import { audit } from '@/lib/audit';

const Body = z.object({
  base: z.string().length(3).toUpperCase(), quote: z.string().length(3).toUpperCase(),
  rate: z.string().regex(/^\d{1,10}(\.\d{1,8})?$/, 'Up to 8 decimals')
}).refine((v) => Number(v.rate) > 0, 'Rate must be positive');

export const GET = route({}, async () => latestRates());
export const POST = route({ roles: ['ADMIN', 'TREASURER'] }, async ({ req, user }) => {
  const b = parse(Body, await readJson(req));
  const rateId = await addRate(b.base, b.quote, b.rate);
  await audit({ corpId: user.corpId, actor: user, action: 'RATE_ADDED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'exchange_rate', id: rateId }, details: b });
  return { rateId };
});
