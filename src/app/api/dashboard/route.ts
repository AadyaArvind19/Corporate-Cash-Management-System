import { route } from '@/lib/http';
import { dashboard } from '@/lib/services/dashboard';
export const GET = route({}, async ({ user }) => dashboard(user.corpId));
