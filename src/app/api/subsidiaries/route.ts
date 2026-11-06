import { z } from 'zod';
import { route, parse, readJson, ipOf } from '@/lib/http';
import { listSubsidiaries, createSubsidiary } from '@/lib/services/reference';
import { audit } from '@/lib/audit';

const subBody = z.object({ name: z.string().trim().min(2).max(150), country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'ISO 3166 alpha-2') });
export const GET = route({}, async ({ user }) => listSubsidiaries(user.corpId));
export const POST = route({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const b = parse(subBody, await readJson(req));
  const subsidiaryId = await createSubsidiary(user.corpId, b.name, b.country);
  await audit({ corpId: user.corpId, actor: user, action: 'SUBSIDIARY_CREATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'subsidiary', id: subsidiaryId }, details: b });
  return { subsidiaryId };
});
