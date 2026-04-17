"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-ink text-cream">
        <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
          <div className="w-full rounded-[32px] border border-white/10 bg-panel p-8 text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-accentSoft">Unexpected error</p>
            <h1 className="mt-4 font-display text-4xl text-white">The party hit a temporary issue.</h1>
            <p className="mt-4 text-sm leading-7 text-cream/65">
              The error was captured for debugging. You can retry the current view without losing the whole session.
            </p>
            <div className="mt-8">
              <Button onClick={reset}>Try again</Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
