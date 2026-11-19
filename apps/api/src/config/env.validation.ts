import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('api/v1'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_PUBLIC_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  PORTAL_TOKEN_TTL_HOURS: z.coerce.number().int().positive().max(24 * 365).default(168),
  PORTAL_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().max(100).default(25),

  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().default('cdc_user'),
  DB_PASSWORD: z.string().default('cdc_dev_password'),
  DB_NAME: z.string().default('client_doc_chaser'),
  DB_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters')
    .default('dev-only-jwt-secret-change-in-production-32c'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('client-docs-private'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),

  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  MALWARE_SCAN_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default(''),
  RESEND_FROM_EMAIL: z.string().optional().default(''),
  RESEND_WEBHOOK_SECRET: z.string().optional().default(''),

  TRIAL_DAYS: z.coerce.number().int().positive().default(14),
  TRIAL_EXPIRED_READ_ONLY: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }

  if (
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.JWT_ACCESS_SECRET.startsWith('dev-only-')
  ) {
    throw new Error(
      'Production environment requires a strong, non-default JWT_ACCESS_SECRET',
    );
  }

  return parsed.data;
}
