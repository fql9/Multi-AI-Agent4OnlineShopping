/**
 * 统一日志配置
 */

import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  base: {
    service: process.env.SERVICE_NAME ?? 'shopping-agent',
    env: process.env.NODE_ENV ?? 'development',
  },
});

export type Logger = typeof logger;

export function createLogger(name: string) {
  return logger.child({ module: name });
}

