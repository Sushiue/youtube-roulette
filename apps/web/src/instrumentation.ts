import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function register() {
  if (!env.sentryDsn) {
    logger.info("Sentry disabled for web server (missing SENTRY_DSN).");
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: 0.1
  });

  logger.info("Sentry enabled for web server.");
}
