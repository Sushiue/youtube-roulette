import { NextResponse } from "next/server";
import { RoomStatus } from "@prisma/client";
import { joinRoomSchema } from "@youtube-roulette/shared";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyRealtimeRoomSync } from "@/lib/realtime-sync";
import { ensureRoomMembership } from "@/lib/rooms";
import { getRoomStateByCode } from "@/lib/room-state";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const payload = joinRoomSchema.safeParse({
    code: String(raw.code ?? "").toUpperCase()
  });

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid room code", issues: payload.error.flatten() }, { status: 400 });
  }

  try {
    const existingRoom = await db.room.findUnique({
      where: {
        code: payload.data.code
      },
      include: {
        players: {
          where: {
            userId: session.user.id
          }
        }
      }
    });

    if (!existingRoom) {
      throw new Error("This room does not exist.");
    }

    if (existingRoom.status === RoomStatus.IN_GAME && existingRoom.players.length === 0) {
      return NextResponse.json(
        { error: "This game has already started. New players cannot join in progress." },
        { status: 403 }
      );
    }

    const { room } = await ensureRoomMembership({
      roomCode: payload.data.code,
      userId: session.user.id,
      displayName: session.user.name ?? "Player",
      image: session.user.image ?? null
    });

    logger.info({ roomCode: room.code, userId: session.user.id }, "Room join persisted.");
    await notifyRealtimeRoomSync(room.code);

    if (room.status === RoomStatus.IN_GAME) {
      const roomState = await getRoomStateByCode(room.code);
      return NextResponse.json({
        roomCode: room.code,
        roomState,
        redirectTo: roomState?.game ? `/game/${roomState.game.id}` : `/room/${room.code}`
      });
    }

    const roomState = await getRoomStateByCode(room.code);
    return NextResponse.json({
      roomCode: room.code,
      roomState,
      redirectTo: `/room/${room.code}`
    });
  } catch (error) {
    logger.warn({ error, roomCode: payload.data.code, userId: session.user.id }, "Room join failed.");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to join room." },
      { status: 400 }
    );
  }
}
