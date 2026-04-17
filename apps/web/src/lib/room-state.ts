import { type Prisma } from "@prisma/client";
import { DEFAULT_ROOM_SETTINGS, type PublicRoomState } from "@youtube-roulette/shared";
import { db } from "@/lib/db";

const roomStateInclude = {
  players: {
    orderBy: {
      joinedAt: "asc"
    }
  },
  videos: {
    where: {
      isActive: true
    }
  },
  games: {
    orderBy: {
      createdAt: "desc"
    },
    take: 1,
    include: {
      rounds: {
        orderBy: {
          number: "asc"
        },
        include: {
          videoEntry: true,
          answers: {
            include: {
              player: true,
              guessedPlayer: true
            }
          }
        }
      },
      scoreSnapshots: {
        orderBy: [
          {
            roundNumber: "desc"
          },
          {
            rank: "asc"
          }
        ]
      }
    }
  }
} satisfies Prisma.RoomInclude;

type RoomStateRecord = Prisma.RoomGetPayload<{ include: typeof roomStateInclude }>;

function mapRoomState(room: RoomStateRecord): PublicRoomState {
  const latestGame = room.games[0] ?? null;
  const persistedSettings = room.settings as unknown as PublicRoomState["settings"];

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    hostUserId: room.hostUserId,
    settings: {
      ...persistedSettings,
      roundDurationSeconds: DEFAULT_ROOM_SETTINGS.roundDurationSeconds
    },
    players: room.players.map((player) => ({
      id: player.id,
      userId: player.userId,
      name: player.displayNameSnapshot,
      image: player.avatarUrlSnapshot,
      isHost: player.userId === room.hostUserId,
      isReady: player.isReady,
      isConnected: player.isConnected,
      videoCount: room.videos.filter((video) => video.ownerPlayerId === player.id).length,
      score: player.currentScore,
      correctAnswers: player.currentCorrectAnswers
    })),
    videosReadyCount: room.videos.length,
    game: latestGame
        ? {
            id: latestGame.id,
            status: latestGame.status,
            totalRounds: latestGame.totalRounds,
            currentRoundNumber: latestGame.currentRoundNumber,
            startedAt: latestGame.startedAt?.toISOString() ?? null,
            endedAt: latestGame.endedAt?.toISOString() ?? null,
            rounds: latestGame.rounds.map((round) => ({
              id: round.id,
              number: round.number,
              status: round.status,
              startedAt: round.startedAt?.toISOString() ?? null,
              endsAt: round.endsAt?.toISOString() ?? null,
              revealedAt: round.revealedAt?.toISOString() ?? null,
              revealEndsAt: round.revealEndsAt?.toISOString() ?? null,
              sourcePlayerId: round.status === "ACTIVE" ? null : round.sourcePlayerId,
              video: round.videoEntry
                ? {
                    id: round.videoEntry.id,
                    ownerPlayerId: round.videoEntry.ownerPlayerId,
                    ownerName:
                      round.status === "ACTIVE"
                        ? ""
                        : room.players.find((player) => player.id === round.videoEntry?.ownerPlayerId)?.displayNameSnapshot ?? "Unknown player",
                    youtubeVideoId: round.videoEntry.youtubeVideoId,
                    title: round.videoEntry.title,
                    thumbnailUrl: round.videoEntry.thumbnailUrl,
                    channelTitle: round.videoEntry.channelTitle,
                    videoUrl: round.videoEntry.url,
                    embedUrl: round.videoEntry.embedUrl,
                    sourceType: round.videoEntry.sourceType
                  }
                : null,
              answers: round.answers.map((answer) => ({
                playerId: answer.playerId,
                guessedPlayerId: answer.guessedPlayerId,
                isCorrect: answer.isCorrect,
                responseTimeMs: answer.responseTimeMs,
                pointsAwarded: answer.pointsAwarded
              }))
            }))
        }
      : null
  };
}

export async function getRoomStateByCode(code: string) {
  const room = await db.room.findUnique({
    where: {
      code
    },
    include: roomStateInclude
  });

  if (!room) {
    return null;
  }

  return mapRoomState(room);
}

export async function getRoomStateByGameId(gameId: string) {
  const game = await db.game.findUnique({
    where: {
      id: gameId
    },
    include: {
      room: {
        include: roomStateInclude
      }
    }
  });

  if (!game?.room) {
    return null;
  }

  return mapRoomState(game.room);
}
