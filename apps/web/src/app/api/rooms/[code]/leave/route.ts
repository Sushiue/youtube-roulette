import { NextResponse } from "next/server";
import { RoomStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyRealtimeRoomSync } from "@/lib/realtime-sync";
import { transferHostIfNeeded } from "@/lib/rooms";

export async function POST(_: Request, context: { params: { code: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomCode = context.params.code.toUpperCase();
  const roomPlayer = await db.roomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        code: roomCode
      }
    },
    include: {
      room: true
    }
  });

  if (!roomPlayer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (roomPlayer.room.status === RoomStatus.LOBBY) {
    await db.roomPlayer.delete({
      where: {
        id: roomPlayer.id
      }
    });
  } else {
    await db.roomPlayer.update({
      where: {
        id: roomPlayer.id
      },
      data: {
        isConnected: false,
        isReady: false,
        disconnectedAt: new Date(),
        lastSeenAt: new Date()
      }
    });
  }

  logger.info({ roomCode, userId: session.user.id, roomPlayerId: roomPlayer.id }, "Room leave persisted.");
  await transferHostIfNeeded(roomPlayer.roomId);
  await notifyRealtimeRoomSync(roomCode);

  return NextResponse.json({ ok: true });
}
