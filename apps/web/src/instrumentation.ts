import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { loadOptionalSentry } from "@/lib/optional-sentry";

export async function register() {
  if (!env.sentryDsn) {
    logger.info("Sentry disabled for web server (missing SENTRY_DSN).");
    return;
  }

  const Sentry = await loadOptionalSentry();
  if (!Sentry?.init) {
    logger.warn("Sentry DSN is configured, but @sentry/nextjs is unavailable. Skipping web server instrumentation.");
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: 0.1
  });

  logger.info("Sentry enabled for web server.");
}
