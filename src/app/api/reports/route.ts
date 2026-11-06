import { route } from '@/lib/http';
import { sqlReports, mongoReports } from '@/lib/services/reports';
export const GET = route({}, async ({ req, user }) => {
  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get('days') || 90)));
  return { sql: await sqlReports(user.corpId, days), mongo: await mongoReports(user.corpId, days) };
});
