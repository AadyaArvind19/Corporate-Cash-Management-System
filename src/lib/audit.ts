import { coll } from './mongo';

export type AuditActor = { userId: number; username: string; role: 'ADMIN' | 'TREASURER' | 'ANALYST' };

export type AuditEvent = {
  ts: Date;
  corpId: number;
  actor?: AuditActor;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  entity?: { type: string; id?: number | string };
  ip?: string;
  details?: Record<string, unknown>;
};

/**
 * Best-effort append to the MongoDB audit trail. The authoritative business record always lives
 * in PostgreSQL; an unavailable audit store must never block a treasury operation, so failures
 * are logged and swallowed.
 */
export async function audit(e: Omit<AuditEvent, 'ts'>): Promise<void> {
  try {
    const c = await coll<AuditEvent>('audit_events');
    await c.insertOne({ ...e, ts: new Date() });
  } catch (err) {
    console.error('[audit] write failed:', (err as Error).message);
  }
}
