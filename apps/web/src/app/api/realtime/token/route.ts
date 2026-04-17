import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { signRealtimeToken } from "@/lib/realtime-token";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const roomCode = String(payload.roomCode ?? "").toUpperCase();
  if (!roomCode) {
    return NextResponse.json({ error: "roomCode is required" }, { status: 400 });
  }

  const roomPlayer = await db.roomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        code: roomCode
      }
    }
  });

  if (!roomPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await signRealtimeToken({
    sub: session.user.id,
    roomCode,
    roomPlayerId: roomPlayer.id,
    name: roomPlayer.displayNameSnapshot,
    image: roomPlayer.avatarUrlSnapshot
  });

  logger.debug({ roomCode, userId: session.user.id, roomPlayerId: roomPlayer.id }, "Issued realtime token.");
  return NextResponse.json({ token });
}
