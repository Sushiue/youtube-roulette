type SentryLike = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown) => void;
  captureRouterTransitionStart?: (...args: unknown[]) => void;
};

async function dynamicImport(moduleName: string) {
  const loader = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;
  return loader(moduleName);
}

export async function loadOptionalSentry(): Promise<SentryLike | null> {
  try {
    const importedSentry = (await dynamicImport("@sentry/nextjs")) as SentryLike;
    return importedSentry;
  } catch {
    return null;
  }
}
