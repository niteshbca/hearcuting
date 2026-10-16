import { createApp } from './app';
import { connectDB, createAllIndexes } from './config/db';
import { env, isProd } from './config/env';
import { logger } from './config/logger';
import { startJobs, stopJobs } from './jobs';
import { ensureBusinessHours, getSettings } from './services/settings.service';
import { User } from './models/User';

async function main(): Promise<void> {
  await connectDB();

  if (!isProd()) {
    await createAllIndexes();
  }

  await getSettings();
  await ensureBusinessHours();

  const owners = await User.countDocuments({ role: 'owner' });
  if (owners === 0) {
    logger.warn(
      'No owner account exists yet. Run `npm run create-owner -w server` to create the salon owner login.'
    );
  }

  const app = createApp();
  const port = env().PORT;

  const server = app.listen(port, () => {
    logger.info(`SalonPro API listening on http://localhost:${port} (${env().NODE_ENV})`);
  });

  startJobs();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopJobs();
    server.close(() => {
      logger.info('http server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
  });
}

void main().catch((err) => {
  logger.fatal({ err }, 'failed to start server');
  process.exit(1);
});
