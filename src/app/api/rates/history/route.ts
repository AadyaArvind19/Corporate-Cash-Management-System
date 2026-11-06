import { route, ApiError } from '@/lib/http';
import { rateHistory } from '@/lib/services/reference';
export const GET = route({}, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const base = sp.get('base')?.toUpperCase(), quote = sp.get('quote')?.toUpperCase();
  if (!base || !quote || base.length !== 3 || quote.length !== 3) throw new ApiError(400, 'base and quote are required');
  return rateHistory(base, quote, Math.min(365, Number(sp.get('days') || 90)));
});
