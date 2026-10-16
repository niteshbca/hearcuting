import { processEmailQueue } from '../services/mail.service';
import { logger } from '../config/logger';

let running = false;
let timer: NodeJS.Timeout | null = null;

/** Background email queue processor — safe to call concurrently (guarded). */
export async function tickEmailQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const processed = await processEmailQueue(10);
    if (processed > 0) logger.debug({ processed }, 'email queue tick');
  } catch (err) {
    logger.error({ err }, 'email queue tick failed');
  } finally {
    running = false;
  }
}

export function startEmailWorker(intervalMs = 15_000): void {
  if (timer) return;
  timer = setInterval(() => void tickEmailQueue(), intervalMs);
  timer.unref?.();
  void tickEmailQueue();
  logger.info({ intervalMs }, 'email worker started');
}

export function stopEmailWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
