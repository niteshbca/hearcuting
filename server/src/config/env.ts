import 'dotenv/config';
import { z } from 'zod';

const DEV_ACCESS = 'salonpro-dev-access-secret-change-me';
const DEV_REFRESH = 'salonpro-dev-refresh-secret-change-me';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/salonpro'),
    JWT_SECRET: z.string().min(16).default(DEV_ACCESS),
    JWT_REFRESH_SECRET: z.string().min(16).default(DEV_REFRESH),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    CLIENT_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4173'),
    TIMEZONE: z.string().default('Asia/Kolkata'),
    LOG_LEVEL: z.string().default('info'),
    RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_SECURE: z
      .enum(['true', 'false', ''])
      .optional()
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().or(z.string().min(3)).optional(),
    SMTP_FROM_NAME: z.string().default('SalonPro'),
    EMAIL_REMINDER_HOURS_BEFORE: z.coerce.number().int().default(3),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_UPLOAD_PRESET: z.string().optional(),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      if (val.JWT_SECRET === DEV_ACCESS || val.JWT_REFRESH_SECRET === DEV_REFRESH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_SECRET and JWT_REFRESH_SECRET must be set to strong unique values in production',
        });
      }
      if (!val.SMTP_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'SMTP_HOST is required in production to send booking emails',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
export const isTest = () => env().NODE_ENV === 'test';
export const isDev = () => env().NODE_ENV === 'development';
export const smtpConfigured = () => Boolean(env().SMTP_HOST);
export const razorpayConfigured = () =>
  Boolean(env().RAZORPAY_KEY_ID && env().RAZORPAY_KEY_SECRET);
