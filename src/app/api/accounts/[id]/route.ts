import { z } from 'zod';
import { route, parse, readJson, id, money, ApiError, ipOf } from '@/lib/http';
import { getAccount, accountHistory, accountTransfers, updateAccount, deleteAccount } from '@/lib/services/accounts';
import { audit } from '@/lib/audit';

type P = { id: string };
const Patch = z.object({
  nickname: z.string().trim().min(2).max(80).optional(), minReserve: money.optional(), minSweepAmount: money.optional(),
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']).optional()
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const GET = route<P>({}, async ({ user, params }) => {
  const aid = parse(id, params.id);
  const account = await getAccount(user.corpId, aid);
  if (!account) throw new ApiError(404, 'Account not found');
  return { account, history: await accountHistory(aid), transfers: await accountTransfers(aid) };
});

export const PATCH = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const aid = parse(id, params.id);
  const body = parse(Patch, await readJson(req));
  if (!(await updateAccount(user.corpId, aid, body))) throw new ApiError(404, 'Account not found');
  await audit({ corpId: user.corpId, actor: user, action: 'ACCOUNT_UPDATED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'bank_account', id: aid }, details: body });
  return { ok: true };
});

export const DELETE = route<P>({ roles: ['ADMIN'] }, async ({ req, user, params }) => {
  const aid = parse(id, params.id);
  if (!(await deleteAccount(user.corpId, aid))) throw new ApiError(404, 'Account not found');
  await audit({ corpId: user.corpId, actor: user, action: 'ACCOUNT_DELETED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'bank_account', id: aid } });
  return { ok: true };
});
