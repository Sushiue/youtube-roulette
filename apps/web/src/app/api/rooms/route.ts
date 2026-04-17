import { NextResponse } from "next/server";
import { createRoomSchema } from "@youtube-roulette/shared";
import { auth } from "@/lib/auth";
import { createRoomForHost } from "@/lib/rooms";
import { getRoomStateByCode } from "@/lib/room-state";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = createRoomSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload", issues: payload.error.flatten() }, { status: 400 });
  }

  const room = await createRoomForHost({
    hostUserId: session.user.id,
    displayName: payload.data.displayName ?? session.user.name ?? "Player",
    image: session.user.image ?? null
  });

  const roomState = await getRoomStateByCode(room.code);

  return NextResponse.json({
    roomCode: room.code,
    roomState
  });
}
