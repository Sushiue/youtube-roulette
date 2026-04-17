import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRoomStateByGameId } from "@/lib/room-state";
import { GameClient } from "@/components/game/game-client";

export default async function GamePage({
  params
}: {
  params: {
    gameId: string;
  };
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const game = await db.game.findUnique({
    where: {
      id: params.gameId
    },
    include: {
      room: {
        include: {
          players: true
        }
      }
    }
  });

  if (!game) {
    notFound();
  }

  const isMember = game.room.players.some((player) => player.userId === session.user.id);
  if (!isMember) {
    redirect("/rooms");
  }

  const roomState = await getRoomStateByGameId(game.id);
  if (!roomState) {
    notFound();
  }

  if (roomState.game?.status === "FINISHED" || roomState.game?.status === "INTERRUPTED") {
    redirect(`/results/${game.id}`);
  }

  const membership = await db.roomPlayer.findFirst({
    where: {
      roomId: game.roomId,
      userId: session.user.id
    },
    select: {
      ownedVideos: {
        where: {
          isActive: true
        },
        select: {
          id: true
        }
      }
    }
  });

  return (
    <GameClient
      initialRoomState={roomState}
      currentUserId={session.user.id}
      ownedVideoIds={membership?.ownedVideos.map((video) => video.id) ?? []}
    />
  );
}
