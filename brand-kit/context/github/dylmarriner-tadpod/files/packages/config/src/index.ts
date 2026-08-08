import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().trim().min(1).default('TADPODS'),
  DATABASE_URL: z.string().url().default('postgresql://tadpods:tadpods@localhost:5432/tadpods?schema=public'),
  AUTH_SECRET: z.string().default('development-only-tadpods-secret-change-me'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DEFAULT_CURRENCY: z.string().regex(/^[A-Z]{3}$/).default('NZD'),
  NEGATIVE_STOCK_ENABLED: booleanFromString.default(false),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().min(1).default('tadpods'),
  S3_SECRET_KEY: z.string().min(8).default('local-tadpods-secret'),
  S3_BUCKET: z.string().min(3).default('tadpods-attachments'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025)
});

export type AppEnvironment = {
  nodeEnv: 'development' | 'test' | 'production';
  appName: string;
  databaseUrl: string;
  authSecret: string;
  corsOrigin: string;
  apiPort: number;
  webPort: number;
  defaultCurrency: string;
  negativeStockEnabled: boolean;
  s3: { endpoint: string; accessKey: string; secretKey: string; bucket: string };
  smtp: { host: string; port: number };
};

export function loadEnvironment(source: NodeJS.ProcessEnv): AppEnvironment {
  const parsed = rawEnvironmentSchema.parse(source);
  if (parsed.NODE_ENV === 'production' && parsed.AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters in production');
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    appName: parsed.APP_NAME,
    databaseUrl: parsed.DATABASE_URL,
    authSecret: parsed.AUTH_SECRET,
    corsOrigin: parsed.CORS_ORIGIN,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    defaultCurrency: parsed.DEFAULT_CURRENCY,
    negativeStockEnabled: parsed.NEGATIVE_STOCK_ENABLED,
    s3: { endpoint: parsed.S3_ENDPOINT, accessKey: parsed.S3_ACCESS_KEY, secretKey: parsed.S3_SECRET_KEY, bucket: parsed.S3_BUCKET },
    smtp: { host: parsed.SMTP_HOST, port: parsed.SMTP_PORT }
  };
}
