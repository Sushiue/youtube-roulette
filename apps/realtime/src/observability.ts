import * as Sentry from "@sentry/node";
import { env } from "./env.js";
import { logger } from "./logger.js";

export function setupObservability() {
  if (!env.sentryDsn) {
    logger.info("Sentry disabled for realtime (missing SENTRY_DSN).");
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: 0.1
  });

  logger.info("Sentry enabled for realtime.");
}

export { Sentry };
