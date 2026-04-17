import { SignJWT, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import type { RealtimeTokenPayload } from "@youtube-roulette/shared";

const secret = new TextEncoder().encode(env.realtimeJwtSecret);

export async function signRealtimeToken(payload: RealtimeTokenPayload) {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}
