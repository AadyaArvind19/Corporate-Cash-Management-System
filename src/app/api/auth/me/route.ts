import { route } from '@/lib/http';
export const GET = route({}, async ({ user }) => user);
