import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';

/**
 * Dev-only in-memory MongoDB (no local install required).
 *   npm run db:dev -w server
 * Prints the connection string; paste it into server/.env as MONGODB_URI.
 * Data lives in ./.mongodb-memory so restarts keep your data.
 */
async function main() {
  const dbPath = path.resolve(process.cwd(), '.mongodb-memory');
  fs.mkdirSync(dbPath, { recursive: true });

  const server = await MongoMemoryServer.create({
    instance: { dbName: 'salonpro', dbPath, storageEngine: 'wiredTiger' },
    binary: { version: '7.0.14' },
  });

  const uri = server.getUri();
  console.log('\n=================================================');
  console.log(' In-memory MongoDB is running (dev only)');
  console.log(` MONGODB_URI=${uri}salonpro`);
  console.log(' Keep this terminal open. Press Ctrl+C to stop.');
  console.log('=================================================\n');

  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((err) => {
  console.error('Failed to start in-memory MongoDB:', err);
  process.exit(1);
});
