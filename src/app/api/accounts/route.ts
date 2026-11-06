import { z } from 'zod';
import { route, parse, readJson, id, money, ipOf } from '@/lib/http';
import { listAccounts, createAccount } from '@/lib/services/accounts';
import { audit } from '@/lib/audit';

const Create = z.object({
  subsidiaryId: id, bankId: id,
  currency: z.string().length(3).toUpperCase(),
  nickname: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,34}$/, '5-34 letters, digits or hyphens'),
  accountType: z.enum(['OPERATING', 'TREASURY']).default('OPERATING'),
  openingBalance: money.default('0'), minReserve: money.default('0'), minSweepAmount: money.default('1000')
});

export const GET = route({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return listAccounts(user.corpId, {
    q: sp.get('q') ?? undefined, currency: sp.get('currency') ?? undefined, position: sp.get('position') ?? undefined,
    status: sp.get('status') ?? undefined, subsidiaryId: sp.get('subsidiaryId') ? Number(sp.get('subsidiaryId')) : undefined
  });
});

export const POST = route({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const b = parse(Create, await readJson(req));
  const accountId = await createAccount(user.corpId, user.userId, b);
  await audit({ corpId: user.corpId, actor: user, action: 'ACCOUNT_CREATED', outcome: 'SUCCESS', ip: ipOf(req),
                entity: { type: 'bank_account', id: accountId }, details: { nickname: b.nickname, currency: b.currency, type: b.accountType } });
  return { accountId };
});
