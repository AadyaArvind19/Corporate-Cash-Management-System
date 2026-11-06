import { route, parse, id, ApiError } from '@/lib/http';
import { batchDetail } from '@/lib/services/sweeps';
export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  const d = await batchDetail(user.corpId, parse(id, params.id));
  if (!d) throw new ApiError(404, 'Batch not found');
  return d;
});
