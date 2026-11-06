import { z } from 'zod';
import { route, parse, id, money } from '@/lib/http';
import { findRoutes } from '@/lib/services/reference';

const Q = z.object({ from: id, to: id, amount: money, currency: z.string().length(3).toUpperCase() });
export const GET = route({}, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const q = parse(Q, { from: sp.get('from'), to: sp.get('to'), amount: sp.get('amount'), currency: sp.get('currency') });
  return findRoutes(q.from, q.to, q.amount, q.currency);
});
