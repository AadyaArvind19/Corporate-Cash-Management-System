// =============================================================================
// Aggregation pipelines used by the Reports page (also exported to the app).
// Run in mongosh: db.audit_events.aggregate(activityByAction(1, 30))
// =============================================================================

// Activity per action over the last N days, split by outcome
const activityByAction = (corpId, days) => [
  { $match: { corpId, ts: { $gte: new Date(Date.now() - days * 864e5) } } },
  { $group: { _id: { action: '$action', outcome: '$outcome' }, events: { $sum: 1 }, lastSeen: { $max: '$ts' } } },
  { $sort: { events: -1 } },
  { $project: { _id: 0, action: '$_id.action', outcome: '$_id.outcome', events: 1, lastSeen: 1 } }
];

// Failed sign-ins per username (security review)
const failedLogins = (corpId, days) => [
  { $match: { corpId, action: 'AUTH_LOGIN', outcome: 'FAILURE', ts: { $gte: new Date(Date.now() - days * 864e5) } } },
  { $group: { _id: '$details.username', attempts: { $sum: 1 }, lastAttempt: { $max: '$ts' } } },
  { $sort: { attempts: -1 } },
  { $project: { _id: 0, username: '$_id', attempts: 1, lastAttempt: 1 } }
];

// Fees and volume per corridor, flattened from nested transfer -> route arrays
const corridorCost = (corpId) => [
  { $match: { corpId } },
  { $unwind: '$transfers' },
  { $match: { 'transfers.status': 'COMPLETED' } },
  { $unwind: '$transfers.route' },
  { $group: { _id: '$transfers.route.corridorId',
              fromBank: { $first: '$transfers.route.fromBank' }, toBank: { $first: '$transfers.route.toBank' },
              transfers: { $sum: 1 }, avgLatencyMin: { $avg: '$transfers.route.latencyMinutes' },
              volumeBase: { $sum: '$transfers.amountBase' } } },
  { $sort: { transfers: -1 } },
  { $project: { _id: 0, corridorId: '$_id', fromBank: 1, toBank: 1, transfers: 1,
                avgLatencyMin: { $round: ['$avgLatencyMin', 0] }, volumeBase: { $round: ['$volumeBase', 2] } } }
];

// Cost of moving money per batch: fees as a share of volume
const batchEfficiency = (corpId) => [
  { $match: { corpId } },
  { $project: { _id: 0, batchId: 1, ts: 1, baseCurrency: 1, completed: '$summary.completed', failed: '$summary.failed',
                volumeBase: '$summary.volumeBase', feesBase: '$summary.feesBase',
                feeRatePct: { $cond: [{ $gt: ['$summary.volumeBase', 0] },
                                      { $multiply: [{ $divide: ['$summary.feesBase', '$summary.volumeBase'] }, 100] }, 0] } } },
  { $sort: { ts: -1 } }
];

if (typeof module !== 'undefined') module.exports = { activityByAction, failedLogins, corridorCost, batchEfficiency };
