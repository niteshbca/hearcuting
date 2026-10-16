import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

let txSupported = false;

export async function connectDB(uri = env().MONGODB_URI): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri, { autoIndex: false });
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  await detectTransactions();
  return conn;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Transactions require a replica set (Atlas is one). On standalone
 * dev databases we fall back to optimistic writes + post-insert
 * verification (see utils/tx.ts).
 */
async function detectTransactions(): Promise<void> {
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        /* no-op probe */
      });
      txSupported = true;
    } finally {
      await session.endSession();
    }
  } catch {
    txSupported = false;
    logger.warn(
      'MongoDB transactions unavailable (standalone server). Using optimistic locking fallback for bookings.'
    );
  }
}

export const transactionsSupported = () => txSupported;

/** Create indexes for all registered models (idempotent). */
export async function createAllIndexes(): Promise<void> {
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((m) => m.createIndexes()));
  logger.info({ count: models.length }, 'MongoDB indexes ensured');
}
