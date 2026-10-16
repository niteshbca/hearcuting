import mongoose, { ClientSession } from 'mongoose';
import { transactionsSupported } from '../config/db';

export type TxWork<T> = (session: ClientSession | undefined) => Promise<T>;

/**
 * Runs `work` inside a MongoDB transaction when the deployment supports it
 * (replica set / Atlas). On standalone servers (local dev) it runs without a
 * session — callers must then rely on optimistic verification + unique
 * constraints for write safety.
 */
export async function runWithOptionalTx<T>(work: TxWork<T>): Promise<T> {
  if (!transactionsSupported() || mongoose.connection.readyState !== 1) {
    return work(undefined);
  }
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new Error('Transaction work did not return a result');
    return result;
  } finally {
    await session.endSession();
  }
}

/** Helper: pass-through options object carrying the session when present. */
export function txOpts(session: ClientSession | undefined): { session?: ClientSession } {
  return session ? { session } : {};
}
