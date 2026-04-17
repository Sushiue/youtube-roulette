import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoomStateByCode } from "@/lib/room-state";
import { db } from "@/lib/db";

export async function GET(_: Request, context: { params: { code: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomCode = context.params.code.toUpperCase();
  const membership = await db.roomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        code: roomCode
      }
    },
    select: {
      id: true
    }
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roomState = await getRoomStateByCode(roomCode);
  if (!roomState) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(roomState);
}
