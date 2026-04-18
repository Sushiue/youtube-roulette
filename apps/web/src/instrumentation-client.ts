import { loadOptionalSentry } from "@/lib/optional-sentry";

export async function onRouterTransitionStart(...args: unknown[]) {
  const Sentry = await loadOptionalSentry();
  Sentry?.captureRouterTransitionStart?.(...args);
}

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void loadOptionalSentry().then((Sentry) => {
    Sentry?.init?.({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1
    });
  });
}
