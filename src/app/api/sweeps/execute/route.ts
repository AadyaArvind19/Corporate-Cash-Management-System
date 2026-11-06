import { z } from 'zod';
import { route, parse, readJson, id, ipOf } from '@/lib/http';
import { executeBatch, writeRunSnapshot } from '@/lib/services/sweeps';
import { audit } from '@/lib/audit';

const Body = z.object({ accountIds: z.array(id).min(1).max(200).optional(), note: z.string().trim().max(200).optional() });

export const POST = route({ roles: ['ADMIN', 'TREASURER'] }, async ({ req, user }) => {
  const b = parse(Body, await readJson(req));
  const actor = user;
  try {
    const batchId = await executeBatch(user.corpId, user.userId, b.accountIds ?? null, b.note || null);
    await audit({ corpId: user.corpId, actor, action: 'SWEEP_BATCH_EXECUTED', outcome: 'SUCCESS', ip: ipOf(req), entity: { type: 'sweep_batch', id: batchId }, details: { accounts: b.accountIds?.length ?? 'all' } });
    try { await writeRunSnapshot(user.corpId, batchId); } catch (e) { console.error('[snapshot] failed:', (e as Error).message); }
    return { batchId };
  } catch (e: any) {
    await audit({ corpId: user.corpId, actor, action: 'SWEEP_BATCH_EXECUTED', outcome: 'FAILURE', ip: ipOf(req), details: { error: String(e.message).slice(0, 200) } });
    throw e;
  }
});
