import { startEmailWorker, stopEmailWorker } from './emailWorker';
import { startReminderWorker, stopReminderWorker } from './reminders';
import { logger } from '../config/logger';

export function startJobs(): void {
  startEmailWorker();
  startReminderWorker();
  logger.info('background jobs started');
}

export function stopJobs(): void {
  stopEmailWorker();
  stopReminderWorker();
}
