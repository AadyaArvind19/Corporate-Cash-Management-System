import { route } from '@/lib/http';
import { sweepHistory } from '@/lib/services/sweeps';

export const GET = route({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const n = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  return sweepHistory(user.corpId, {
    status: sp.get('status') || undefined, type: sp.get('type') || undefined, accountId: n('accountId'),
    from: sp.get('from') || undefined, to: sp.get('to') || undefined, q: sp.get('q') || undefined, page: n('page')
  });
});
