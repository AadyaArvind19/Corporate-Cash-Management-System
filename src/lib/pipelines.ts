// MongoDB aggregation pipelines (mirrors db/mongo/aggregations.js).
const since = (days: number) => new Date(Date.now() - days * 864e5);

export const activityByAction = (corpId: number, days: number) => [
  { $match: { corpId, ts: { $gte: since(days) } } },
  { $group: { _id: { action: '$action', outcome: '$outcome' }, events: { $sum: 1 }, lastSeen: { $max: '$ts' } } },
  { $sort: { events: -1, '_id.action': 1 } },
  { $project: { _id: 0, action: '$_id.action', outcome: '$_id.outcome', events: 1, lastSeen: 1 } }
];

export const failedLogins = (corpId: number, days: number) => [
  { $match: { corpId, action: 'AUTH_LOGIN', outcome: 'FAILURE', ts: { $gte: since(days) } } },
  { $group: { _id: '$details.username', attempts: { $sum: 1 }, lastAttempt: { $max: '$ts' } } },
  { $sort: { attempts: -1 } },
  { $project: { _id: 0, username: '$_id', attempts: 1, lastAttempt: 1 } }
];

export const corridorCost = (corpId: number) => [
  { $match: { corpId } },
  { $unwind: '$transfers' },
  { $match: { 'transfers.status': 'COMPLETED' } },
  { $unwind: '$transfers.route' },
  { $group: {
      _id: '$transfers.route.corridorId',
      fromBank: { $first: '$transfers.route.fromBank' }, toBank: { $first: '$transfers.route.toBank' },
      transfers: { $sum: 1 }, avgLatencyMin: { $avg: '$transfers.route.latencyMinutes' },
      volumeBase: { $sum: '$transfers.amountBase' } } },
  { $sort: { transfers: -1, _id: 1 } },
  { $project: { _id: 0, corridorId: '$_id', fromBank: 1, toBank: 1, transfers: 1,
      avgLatencyMin: { $round: ['$avgLatencyMin', 0] }, volumeBase: { $round: ['$volumeBase', 2] } } }
];

export const batchEfficiency = (corpId: number) => [
  { $match: { corpId } },
  { $project: { _id: 0, batchId: 1, ts: 1, baseCurrency: 1, completed: '$summary.completed', failed: '$summary.failed',
      volumeBase: '$summary.volumeBase', feesBase: '$summary.feesBase',
      feeRatePct: { $cond: [{ $gt: ['$summary.volumeBase', 0] },
        { $multiply: [{ $divide: ['$summary.feesBase', '$summary.volumeBase'] }, 100] }, 0] } } },
  { $sort: { ts: -1 } }
];
