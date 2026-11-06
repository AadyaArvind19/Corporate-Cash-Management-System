// =============================================================================
// MongoDB initialisation for the Corporate Cash Management System
//   mongosh "$MONGODB_URI" db/mongo/init.js
// (docker-compose mounts this file into /docker-entrypoint-initdb.d)
// =============================================================================
const dbName = (typeof process !== 'undefined' && process.env.MONGODB_DB) || 'ccms';
const target = db.getSiblingDB(dbName);

// ----- audit_events : append-only security / activity log --------------------
target.createCollection('audit_events', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['ts', 'corpId', 'action', 'outcome'],
    properties: {
      ts:      { bsonType: 'date' },
      corpId:  { bsonType: ['int', 'long', 'double'] },
      actor:   { bsonType: 'object',
                 properties: { userId: { bsonType: ['int', 'long', 'double'] },
                               username: { bsonType: 'string' }, role: { enum: ['ADMIN', 'TREASURER', 'ANALYST'] } } },
      action:  { bsonType: 'string' },
      outcome: { enum: ['SUCCESS', 'FAILURE'] },
      entity:  { bsonType: 'object', properties: { type: { bsonType: 'string' } } },
      ip:      { bsonType: 'string' },
      details: { bsonType: 'object' }
    } } },
  validationLevel: 'strict'
});
target.audit_events.createIndex({ corpId: 1, ts: -1 }, { name: 'corp_time' });
target.audit_events.createIndex({ action: 1, ts: -1 }, { name: 'action_time' });
target.audit_events.createIndex({ 'actor.userId': 1, ts: -1 }, { name: 'actor_time' });
target.audit_events.createIndex({ ts: 1 }, { name: 'ttl_730d', expireAfterSeconds: 60 * 60 * 24 * 730 });

// ----- sweep_run_snapshots : point-in-time evidence pack of each executed batch -
target.createCollection('sweep_run_snapshots', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['batchId', 'corpId', 'ts', 'baseCurrency', 'summary', 'transfers'],
    properties: {
      batchId:      { bsonType: ['int', 'long', 'double'] },
      corpId:       { bsonType: ['int', 'long', 'double'] },
      ts:           { bsonType: 'date' },
      baseCurrency: { bsonType: 'string', minLength: 3, maxLength: 3 },
      summary:      { bsonType: 'object', required: ['completed', 'failed'] },
      transfers:    { bsonType: 'array', minItems: 1,
                      items: { bsonType: 'object', required: ['type', 'status', 'from', 'to', 'route'],
                               properties: { route: { bsonType: 'array' } } } },
      rates:        { bsonType: 'array' }
    } } },
  validationLevel: 'strict'
});
target.sweep_run_snapshots.createIndex({ batchId: 1 }, { unique: true, name: 'batch_unique' });
target.sweep_run_snapshots.createIndex({ corpId: 1, ts: -1 }, { name: 'corp_time' });
target.sweep_run_snapshots.createIndex({ 'transfers.route.corridorId': 1 }, { name: 'corridor_multikey' });
