import { z } from 'zod';
import { route, parse, readJson, ipOf } from '@/lib/http';
import { listBanks, createBank } from '@/lib/services/reference';
import { audit } from '@/lib/audit';

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  swiftBic: z.string().trim().toUpperCase().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Invalid SWIFT/BIC'),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'ISO 3166 alpha-2')
});
export const GET = route({}, async () => listBanks());
export const POST = route({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const b = parse(Body, await readJson(req));
  const bankId = await createBank(b);
  await audit({ corpId: user.corpId, actor: user, action: 'BANK_CREATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'bank', id: bankId }, details: b });
  return { bankId };
});
