import { route } from '@/lib/http';
import { auditEvents } from '@/lib/services/reports';
export const GET = route({ roles: ['ADMIN'] }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return auditEvents(user.corpId, { action: sp.get('action') || undefined, outcome: sp.get('outcome') || undefined, username: sp.get('username') || undefined, page: Number(sp.get('page') || 1) });
});
