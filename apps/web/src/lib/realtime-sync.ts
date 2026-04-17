import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function notifyRealtimeRoomSync(roomCode: string) {
  if (!env.realtimeServerUrl) {
    logger.warn({ roomCode }, "Realtime sync skipped because NEXT_PUBLIC_REALTIME_SERVER_URL is missing.");
    return;
  }

  try {
    const response = await fetch(
      `${env.realtimeServerUrl.replace(/\/$/, "")}/internal/rooms/${roomCode}/sync`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.realtimeJwtSecret}`
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const message = await response.text();
      logger.warn({ roomCode, status: response.status, message }, "Realtime room sync request failed.");
      return;
    }

    logger.info({ roomCode }, "Realtime room sync request succeeded.");
  } catch (error) {
    logger.warn({ error, roomCode }, "Unable to notify realtime server about room state changes.");
  }
}
