import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRoomStateByCode } from "@/lib/room-state";
import { RoomClient } from "@/components/room/room-client";

export default async function RoomPage({
  params
}: {
  params: {
    code: string;
  };
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const roomCode = params.code.toUpperCase();
  const membership = await db.roomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        code: roomCode
      }
    }
  });

  if (!membership) {
    redirect("/rooms");
  }

  const googleAccount = await db.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "google"
    },
    select: {
      scope: true,
      expires_at: true
    }
  });

  logger.info(
    {
      event: "room_page_scope_snapshot",
      userId: session.user.id,
      roomCode,
      sessionScopes: session.googleScopes ?? null,
      persistedScopes: googleAccount?.scope ?? null,
      hasAccessToken: Boolean(session.googleAccessToken),
      authError: session.authError,
      persistedExpiresAt: googleAccount?.expires_at
    },
    "Loaded room page with current Google/YouTube scope state."
  );

  const roomState = await getRoomStateByCode(roomCode);
  if (!roomState) {
    notFound();
  }

  if (roomState.game?.status === "IN_PROGRESS") {
    redirect(`/game/${roomState.game.id}`);
  }

  return <RoomClient initialRoomState={roomState} currentUserId={session.user.id} />;
}
