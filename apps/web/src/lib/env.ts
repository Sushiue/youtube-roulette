const requiredEnv = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "REALTIME_JWT_SECRET"
] as const;

type RequiredEnvKey = (typeof requiredEnv)[number];

function getEnv(key: RequiredEnvKey) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export const env = {
  databaseUrl: getEnv("DATABASE_URL"),
  nextAuthSecret: getEnv("NEXTAUTH_SECRET"),
  nextAuthUrl: getEnv("NEXTAUTH_URL"),
  googleClientId: getEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
  realtimeJwtSecret: getEnv("REALTIME_JWT_SECRET"),
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  realtimeServerUrl: process.env.NEXT_PUBLIC_REALTIME_SERVER_URL ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  logLevel: process.env.LOG_LEVEL ?? "info",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  publicSentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  sentryOrg: process.env.SENTRY_ORG ?? "",
  sentryProject: process.env.SENTRY_PROJECT ?? "",
  sentryAuthToken: process.env.SENTRY_AUTH_TOKEN ?? ""
};
