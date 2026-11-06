import { z } from 'zod';
import { route, parse, readJson, id, money, ApiError, ipOf } from '@/lib/http';
import { postBalance } from '@/lib/services/accounts';
import { audit } from '@/lib/audit';

const Body = z.object({ newBalance: money, reason: z.string().trim().max(200).default('') });

export const POST = route<{ id: string }>({ roles: ['ADMIN', 'TREASURER'] }, async ({ req, user, params }) => {
  const aid = parse(id, params.id);
  const b = parse(Body, await readJson(req));
  if (!(await postBalance(user.corpId, user.userId, aid, b.newBalance, b.reason))) throw new ApiError(404, 'Account not found');
  await audit({ corpId: user.corpId, actor: user, action: 'BALANCE_UPDATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'bank_account', id: aid }, details: { newBalance: b.newBalance, reason: b.reason } });
  return { ok: true };
});
