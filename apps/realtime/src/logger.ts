import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  name: "youtube-roulette-realtime",
  level: env.logLevel,
  base: {
    service: "realtime",
    env: env.sentryEnvironment
  }
});
