import pino from "pino";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var webLogger: pino.Logger | undefined;
}

export const logger =
  global.webLogger ??
  pino({
    name: "youtube-roulette-web",
    level: env.logLevel,
    base: {
      service: "web",
      env: env.sentryEnvironment
    }
  });

if (process.env.NODE_ENV !== "production") {
  global.webLogger = logger;
}
