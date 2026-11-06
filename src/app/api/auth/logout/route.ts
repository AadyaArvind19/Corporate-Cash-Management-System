import { route, ipOf } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const POST = route({}, async ({ req, user }) => {
  await audit({ corpId: user.corpId, actor: { userId: user.userId, username: user.username, role: user.role }, action: 'AUTH_LOGOUT', outcome: 'SUCCESS', ip: ipOf(req) });
  await clearSessionCookie();
  return { ok: true };
});
