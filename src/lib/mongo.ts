import { MongoClient, Db, Collection, Document } from 'mongodb';
import { env } from './env';

const g = globalThis as unknown as { __ccmsMongo?: Promise<MongoClient>; __ccmsMongoDownAt?: number };
const BACKOFF_MS = 30_000;

// Circuit breaker: after a failed connection attempt, fail fast for 30 s instead of making every
// request wait for the server-selection timeout while MongoDB is down.
function client(): Promise<MongoClient> {
  if (g.__ccmsMongoDownAt && Date.now() - g.__ccmsMongoDownAt < BACKOFF_MS) {
    return Promise.reject(new Error('MongoDB unavailable (retrying shortly)'));
  }
  if (!g.__ccmsMongo) {
    const c = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 2500, maxPoolSize: 5 });
    g.__ccmsMongo = c.connect().then((cl) => { g.__ccmsMongoDownAt = undefined; return cl; })
      .catch((e) => { g.__ccmsMongo = undefined; g.__ccmsMongoDownAt = Date.now(); throw e; });
  }
  return g.__ccmsMongo;
}

export async function mongoDb(): Promise<Db> {
  return (await client()).db(env.mongoDb);
}

export async function coll<T extends Document = Document>(name: 'audit_events' | 'sweep_run_snapshots'): Promise<Collection<T>> {
  return (await mongoDb()).collection<T>(name);
}
