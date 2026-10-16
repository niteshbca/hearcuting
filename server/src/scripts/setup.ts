import { connectDB, disconnectDB, createAllIndexes } from '../config/db';
import { ensureBusinessHours, getSettings } from '../services/settings.service';
import { logger } from '../config/logger';

/**
 * Prepares a database for first use: connects, ensures all indexes exist,
 * creates the singleton settings document and default business hours.
 */
async function main() {
  await connectDB();
  await createAllIndexes();
  await getSettings();
  await ensureBusinessHours();
  logger.info('Database setup complete (indexes, settings, business hours)');
  await disconnectDB();
}

main().catch((err) => {
  logger.fatal({ err }, 'db setup failed');
  process.exit(1);
});
