const required = [
  "DATABASE_URL",
  "REALTIME_JWT_SECRET",
  "CLIENT_URL",
  "PORT"
] as const;

type RequiredKey = (typeof required)[number];

function getEnv(key: RequiredKey) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export const env = {
  databaseUrl: getEnv("DATABASE_URL"),
  realtimeJwtSecret: getEnv("REALTIME_JWT_SECRET"),
  clientUrl: getEnv("CLIENT_URL"),
  port: Number(getEnv("PORT")),
  logLevel: process.env.LOG_LEVEL ?? "info",
  redisUrl: process.env.REDIS_URL ?? "",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development"
};
