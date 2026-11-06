// Verifies the MongoDB aggregation pipelines with an in-process engine (mingo) over representative documents.
import { describe, it, expect } from 'vitest';
import { Aggregator } from 'mingo/aggregator';
import 'mingo/init/system';
import { activityByAction, failedLogins, corridorCost, batchEfficiency } from '../src/lib/pipelines';

const now = Date.now();
const ago = (d: number) => new Date(now - d * 864e5);
const audit = [
  { corpId: 1, ts: ago(1), action: 'AUTH_LOGIN', outcome: 'SUCCESS', details: {} },
  { corpId: 1, ts: ago(2), action: 'AUTH_LOGIN', outcome: 'FAILURE', details: { username: 'mallory' } },
  { corpId: 1, ts: ago(3), action: 'AUTH_LOGIN', outcome: 'FAILURE', details: { username: 'mallory' } },
  { corpId: 1, ts: ago(4), action: 'AUTH_LOGIN', outcome: 'FAILURE', details: { username: 'bob' } },
  { corpId: 1, ts: ago(5), action: 'SWEEP_BATCH_EXECUTED', outcome: 'SUCCESS' },
  { corpId: 1, ts: ago(200), action: 'AUTH_LOGIN', outcome: 'FAILURE', details: { username: 'old' } },
  { corpId: 2, ts: ago(1), action: 'AUTH_LOGIN', outcome: 'FAILURE', details: { username: 'other-tenant' } }
];
const route = (corridorId: number, from: string, to: string, lat: number) => ({ corridorId, fromBank: from, toBank: to, latencyMinutes: lat });
const snaps = [
  { batchId: 1, corpId: 1, ts: ago(7), baseCurrency: 'USD', summary: { completed: 2, failed: 1, volumeBase: 1000, feesBase: 5 },
    transfers: [
      { status: 'COMPLETED', amountBase: 600, route: [route(9, 'HDFC', 'DBS', 180), route(5, 'DBS', 'JPM', 300)] },
      { status: 'COMPLETED', amountBase: 400, route: [route(5, 'DBS', 'JPM', 300)] },
      { status: 'FAILED', amountBase: 999, route: [route(1, 'Citi', 'JPM', 45)] }
    ] },
  { batchId: 2, corpId: 1, ts: ago(1), baseCurrency: 'USD', summary: { completed: 1, failed: 0, volumeBase: 0, feesBase: 0 },
    transfers: [{ status: 'COMPLETED', amountBase: 0, route: [] }] },
  { batchId: 3, corpId: 2, ts: ago(1), baseCurrency: 'GBP', summary: { completed: 1, failed: 0, volumeBase: 50, feesBase: 1 },
    transfers: [{ status: 'COMPLETED', amountBase: 50, route: [route(24, 'BNP', 'Barclays', 240)] }] }
];
const run = (p: any[], docs: any[]) => new Aggregator(p).run(docs) as any[];

describe('MongoDB aggregation pipelines', () => {
  it('counts activity per action and outcome inside the period and tenant', () => {
    const r = run(activityByAction(1, 30), audit);
    expect(r.find((x) => x.action === 'AUTH_LOGIN' && x.outcome === 'FAILURE').events).toBe(3);   // 200-day-old and other-tenant excluded
    expect(r[0].events).toBeGreaterThanOrEqual(r[r.length - 1].events);                            // sorted by volume
    expect(r.every((x) => !('_id' in x))).toBe(true);
  });
  it('ranks usernames by failed sign-in attempts', () => {
    const r = run(failedLogins(1, 30), audit);
    expect(r.map((x) => [x.username, x.attempts])).toEqual([['mallory', 2], ['bob', 1]]);
  });
  it('flattens nested transfer/route arrays and ignores failed transfers', () => {
    const r = run(corridorCost(1), snaps);
    const dbs = r.find((x) => x.corridorId === 5);
    expect(dbs).toMatchObject({ transfers: 2, fromBank: 'DBS', toBank: 'JPM', avgLatencyMin: 300, volumeBase: 1000 });
    expect(r.find((x) => x.corridorId === 9)).toMatchObject({ transfers: 1, volumeBase: 600 });
    expect(r.find((x) => x.corridorId === 1)).toBeUndefined();   // belongs to a FAILED transfer
    expect(r.find((x) => x.corridorId === 24)).toBeUndefined();  // other tenant
  });
  it('computes the fee rate per batch and guards against division by zero', () => {
    const r = run(batchEfficiency(1), snaps);
    expect(r.map((x) => x.batchId)).toEqual([2, 1]);              // newest first
    expect(r[1].feeRatePct).toBeCloseTo(0.5, 6);
    expect(r[0].feeRatePct).toBe(0);
  });
});
