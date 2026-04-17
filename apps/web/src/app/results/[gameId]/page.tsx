import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRoomStateByGameId } from "@/lib/room-state";
import { ResultsClient } from "@/components/results/results-client";

export default async function ResultsPage({
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

  const ranking = [...roomState.players].sort((a, b) => {
    if (b.score === a.score) {
      return b.correctAnswers - a.correctAnswers;
    }

    return b.score - a.score;
  });

  return <ResultsClient roomCode={roomState.code} podium={ranking.slice(0, 3)} players={ranking} />;
}
