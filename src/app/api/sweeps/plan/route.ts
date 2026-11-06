import { route } from '@/lib/http';
import { planSweeps } from '@/lib/services/sweeps';
export const GET = route({}, async ({ user }) => planSweeps(user.corpId));
