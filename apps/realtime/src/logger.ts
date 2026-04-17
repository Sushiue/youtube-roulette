import pino from "pino";
import { env } from "./env";

export const logger = pino({
  name: "youtube-roulette-realtime",
  level: env.logLevel,
  base: {
    service: "realtime",
    env: env.sentryEnvironment
  }
});
