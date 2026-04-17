import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRoomStateByGameId } from "@/lib/room-state";

export async function GET(_: Request, context: { params: { gameId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = await db.game.findUnique({
    where: {
      id: context.params.gameId
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
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const isPlayer = game.room.players.some((player) => player.userId === session.user.id);
  if (!isPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roomState = await getRoomStateByGameId(game.id);
  if (!roomState?.game) {
    return NextResponse.json({ error: "Game summary unavailable" }, { status: 404 });
  }

  const ranking = [...roomState.players].sort((a, b) => {
    if (b.score === a.score) {
      return b.correctAnswers - a.correctAnswers;
    }

    return b.score - a.score;
  });

  return NextResponse.json({
    gameId: roomState.game.id,
    roomCode: roomState.code,
    status: roomState.game.status,
    totalRounds: roomState.game.totalRounds,
    players: ranking,
    podium: ranking.slice(0, 3)
  });
}
