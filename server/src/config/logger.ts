import pino from 'pino';
import { isDev, isTest } from './env';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest() ? 'silent' : isDev() ? 'debug' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.signature',
      'body.password',
      'body.token',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev()
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

export type Logger = typeof logger;
