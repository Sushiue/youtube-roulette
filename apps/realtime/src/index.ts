import cors from "cors";
import express from "express";
import { createServer } from "http";
import { jwtVerify } from "jose";
import { PrismaClient, Prisma, GameStatus, RoomStatus, RoundStatus } from "@prisma/client";
import { Server } from "socket.io";
import {
  MIN_PLAYERS,
  MIN_VIDEOS_PER_PLAYER,
  SOCKET_EVENTS,
  buildDeck,
  calculateAnswerScore,
  getRoundDeadline,
  type RoomSettings,
  validateRoomCanStart
} from "@youtube-roulette/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { setupObservability, Sentry } from "./observability.js";
import { getRoomStateByCode } from "./room-state.js";

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: env.clientUrl,
    credentials: true
  }
});

const jwtSecret = new TextEncoder().encode(env.realtimeJwtSecret);
const roundTimers = new Map<string, NodeJS.Timeout>();
const revealTimers = new Map<string, NodeJS.Timeout>();
const interruptionTimers = new Map<string, NodeJS.Timeout>();
const PLAYER_RECONNECT_GRACE_MS = 8_000;

interface SocketUser {
  userId: string;
  roomCode: string;
  roomPlayerId: string;
  name: string;
  image: string | null;
}

setupObservability();

async function setupRedisAdapter() {
  if (!env.redisUrl) {
    logger.info("Redis adapter disabled for Socket.IO (missing REDIS_URL).");
    return;
  }

  const [{ createClient }, { createAdapter }] = await Promise.all([
    import("redis"),
    import("@socket.io/redis-adapter")
  ]);

  const pubClient = createClient({
    url: env.redisUrl
  });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info("Redis adapter enabled for Socket.IO.");
}

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true
  })
);

app.post("/internal/rooms/:roomCode/sync", async (request, response) => {
  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${env.realtimeJwtSecret}`) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const roomCode = String(request.params.roomCode ?? "").toUpperCase();
  if (!roomCode) {
    return response.status(400).json({ error: "roomCode is required" });
  }

  try {
    logger.info({ roomCode }, "Internal room sync requested.");
    await emitRoomState(roomCode);
    return response.json({ ok: true });
  } catch (error) {
    logger.error({ error, roomCode }, "Internal room sync failed.");
    Sentry.captureException(error);
    return response.status(500).json({ error: "Unable to sync room state" });
  }
});

app.get("/health", async (_request, response) => {
  response.json({
    ok: true,
    uptime: process.uptime()
  });
});

function getRoomRecipientCount(roomCode: string) {
  return io.sockets.adapter.rooms.get(roomCode)?.size ?? 0;
}

async function emitRoomState(roomCode: string) {
  const roomState = await getRoomStateByCode(prisma, roomCode);
  if (!roomState) {
    logger.warn({ roomCode }, "Room state broadcast skipped because room was not found.");
    return;
  }

  logger.info(
    {
      roomCode,
      playerCount: roomState.players.length,
      readyPlayersCount: roomState.players.filter((player) => player.isReady).length,
      gameStatus: roomState.game?.status ?? null,
      recipients: getRoomRecipientCount(roomCode)
    },
    "Broadcasting room state."
  );
  io.to(roomCode).emit(SOCKET_EVENTS.roomState, roomState);

  if (roomState.game?.status === "FINISHED" || roomState.game?.status === "INTERRUPTED") {
    io.to(roomCode).emit(SOCKET_EVENTS.gameComplete, roomState);
  }
}

function clearRoundTimer(roundId: string) {
  const timer = roundTimers.get(roundId);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(roundId);
  }
}

function clearRevealTimer(gameId: string) {
  const timer = revealTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    revealTimers.delete(gameId);
  }
}

function clearInterruptionTimer(roomId: string) {
  const timer = interruptionTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    interruptionTimers.delete(roomId);
  }
}

async function scheduleRoundEnd(roundId: string, roomCode: string, delayMs: number) {
  clearRoundTimer(roundId);
  const safeDelayMs = Math.max(0, delayMs);
  logger.info({ roundId, roomCode, delayMs: safeDelayMs }, "Round end timer scheduled.");
  const timer = setTimeout(async () => {
    try {
      await revealRound(roundId, roomCode);
    } catch (error) {
      logger.error({ error, roundId, roomCode }, "Failed to end round.");
      Sentry.captureException(error);
    }
  }, safeDelayMs);

  roundTimers.set(roundId, timer);
}

async function scheduleNextRound(gameId: string, roomCode: string, delayMs = 4500) {
  clearRevealTimer(gameId);
  const safeDelayMs = Math.max(0, delayMs);
  logger.info({ gameId, roomCode, delayMs: safeDelayMs }, "Next round timer scheduled.");
  const timer = setTimeout(async () => {
    try {
      await startNextRound(gameId, roomCode);
    } catch (error) {
      logger.error({ error, gameId, roomCode }, "Failed to schedule next round.");
      Sentry.captureException(error);
    }
  }, safeDelayMs);

  revealTimers.set(gameId, timer);
}

async function updateRanks(gameId: string, roundNumber: number, roomId: string) {
  const players = await prisma.roomPlayer.findMany({
    where: {
      roomId
    },
    orderBy: [
      {
        currentScore: "desc"
      },
      {
        currentCorrectAnswers: "desc"
      },
      {
        joinedAt: "asc"
      }
    ]
  });

  await prisma.scoreSnapshot.createMany({
    data: players.map((player, index) => ({
      gameId,
      roundNumber,
      playerId: player.id,
      score: player.currentScore,
      rank: index + 1,
      correctAnswers: player.currentCorrectAnswers
    })),
    skipDuplicates: true
  });
}

async function completeRevealedRounds(tx: Prisma.TransactionClient, gameId: string, completedAt: Date) {
  await tx.round.updateMany({
    where: {
      gameId,
      status: RoundStatus.REVEALED
    },
    data: {
      status: RoundStatus.COMPLETED,
      completedAt
    }
  });
}

async function revealRound(roundId: string, roomCode: string, reason = "round_timer_elapsed") {
  clearRoundTimer(roundId);

  const revealAt = new Date();
  const revealEndsAt = new Date(Date.now() + 4500);

  const revealed = await prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: {
        id: roundId
      },
      include: {
        answers: true,
        game: {
          include: {
            room: {
              include: {
                players: true
              }
            }
          }
        }
      }
    });

    if (!round || round.status !== RoundStatus.ACTIVE) {
      return null;
    }

    const claim = await tx.round.updateMany({
      where: {
        id: roundId,
        status: RoundStatus.ACTIVE
      },
      data: {
        status: RoundStatus.REVEALED,
        revealedAt: revealAt,
        revealEndsAt
      }
    });

    if (claim.count === 0) {
      return null;
    }

    const correctAnswers = round.answers.filter((answer) => answer.isCorrect && typeof answer.responseTimeMs === "number");
    const fastestCorrect = correctAnswers
      .sort((a, b) => (a.responseTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.responseTimeMs ?? Number.MAX_SAFE_INTEGER))[0];

    const roomSettings = round.game.room.settings as unknown as RoomSettings;

    for (const answer of round.answers) {
      const pointsAwarded = calculateAnswerScore({
        isCorrect: answer.isCorrect,
        isFastestCorrect: correctAnswers.length > 1 && answer.id === fastestCorrect?.id,
        fastestBonusEnabled: roomSettings.fastestBonusEnabled ?? true
      });

      await tx.answer.update({
        where: {
          id: answer.id
        },
        data: {
          pointsAwarded
        }
      });

      if (pointsAwarded > 0) {
        await tx.roomPlayer.update({
          where: {
            id: answer.playerId
          },
          data: {
            currentScore: {
              increment: pointsAwarded
            },
            currentCorrectAnswers: {
              increment: 1
            }
          }
        });
      }
    }

    return {
      gameId: round.gameId,
      roomId: round.game.roomId,
      roundNumber: round.number
    };
  });

  if (!revealed) {
    return;
  }

  logger.info({ roundId, roomCode, gameId: revealed.gameId, reason }, "Round revealed.");
  await updateRanks(revealed.gameId, revealed.roundNumber, revealed.roomId);
  await emitRoomState(roomCode);
  await scheduleNextRound(revealed.gameId, roomCode);
}

async function finishGame(gameId: string, roomCode: string, interrupted = false, reason = "completed_all_rounds") {
  clearRevealTimer(gameId);
  const activeRound = await prisma.round.findFirst({
    where: {
      gameId,
      status: RoundStatus.ACTIVE
    }
  });

  if (activeRound) {
    clearRoundTimer(activeRound.id);
  }

  await prisma.$transaction(async (tx) => {
    const completedAt = new Date();

    if (!interrupted) {
      await completeRevealedRounds(tx, gameId, completedAt);
    }

    await tx.game.update({
      where: {
        id: gameId
      },
      data: {
        status: interrupted ? GameStatus.INTERRUPTED : GameStatus.FINISHED,
        endedAt: completedAt
      }
    });

    await tx.room.updateMany({
      where: {
        games: {
          some: {
            id: gameId
          }
        }
      },
      data: {
        status: interrupted ? RoomStatus.ABANDONED : RoomStatus.FINISHED
      }
    });
  });

  logger.info({ gameId, roomCode, interrupted, reason }, "Game finished.");
  await emitRoomState(roomCode);
}

async function startNextRound(gameId: string, roomCode: string) {
  clearRevealTimer(gameId);

  const game = await prisma.game.findUnique({
    where: {
      id: gameId
    },
    include: {
      room: true,
      rounds: {
        orderBy: {
          number: "asc"
        }
      }
    }
  });

  if (!game || game.status !== GameStatus.IN_PROGRESS) {
    return;
  }

  const nextRound = game.rounds.find((round) => round.status === RoundStatus.PENDING);
  if (!nextRound) {
    await finishGame(gameId, roomCode, false, "all_rounds_completed");
    return;
  }

  const settings = game.room.settings as unknown as RoomSettings;
  const now = new Date();
  const endsAt = getRoundDeadline(now, settings);

  const claimed = await prisma.$transaction(async (tx) => {
    await completeRevealedRounds(tx, gameId, now);

    const roundUpdate = await tx.round.updateMany({
      where: {
        id: nextRound.id,
        status: RoundStatus.PENDING
      },
      data: {
        status: RoundStatus.ACTIVE,
        startedAt: now,
        endsAt
      }
    });

    if (roundUpdate.count === 0) {
      return false;
    }

    await tx.game.update({
      where: {
        id: gameId
      },
      data: {
        currentRoundNumber: nextRound.number
      }
    });

    return true;
  });

  if (!claimed) {
    return;
  }

  logger.info(
    {
      gameId,
      roomCode,
      roundId: nextRound.id,
      roundNumber: nextRound.number,
      endsAt: endsAt.toISOString(),
      durationMs: endsAt.getTime() - now.getTime()
    },
    "Next round started."
  );
  await emitRoomState(roomCode);
  await scheduleRoundEnd(nextRound.id, roomCode, endsAt.getTime() - Date.now());
}

async function interruptIfNotEnoughPlayers(roomId: string, roomCode: string, reason: string) {
  const connectedPlayers = await prisma.roomPlayer.count({
    where: {
      roomId,
      isConnected: true
    }
  });

  if (connectedPlayers >= MIN_PLAYERS) {
    logger.info({ roomId, roomCode, connectedPlayers, reason }, "Game interruption skipped because enough players are connected again.");
    return;
  }

  const activeGame = await prisma.game.findFirst({
    where: {
      roomId,
      status: GameStatus.IN_PROGRESS
    }
  });

  if (activeGame) {
    logger.warn({ roomId, roomCode, connectedPlayers, gameId: activeGame.id, reason }, "Interrupting active game due to insufficient connected players.");
    await finishGame(activeGame.id, roomCode, true, reason);
  }
}

function scheduleInterruptIfNotEnoughPlayers(roomId: string, roomCode: string, reason: string, delayMs = PLAYER_RECONNECT_GRACE_MS) {
  clearInterruptionTimer(roomId);
  logger.info({ roomId, roomCode, reason, delayMs }, "Scheduling insufficient-player interruption check.");
  const timer = setTimeout(async () => {
    interruptionTimers.delete(roomId);

    try {
      await interruptIfNotEnoughPlayers(roomId, roomCode, reason);
    } catch (error) {
      logger.error({ error, roomId, roomCode, reason }, "Failed to evaluate insufficient-player interruption.");
      Sentry.captureException(error);
    }
  }, Math.max(0, delayMs));

  interruptionTimers.set(roomId, timer);
}

async function startGame(roomCode: string, hostUserId: string) {
  const room = await prisma.room.findUnique({
    where: {
      code: roomCode
    },
    include: {
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
        where: {
          status: {
            in: [GameStatus.FINISHED, GameStatus.INTERRUPTED]
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 5,
        include: {
          rounds: {
            where: {
              videoEntryId: {
                not: null
              }
            },
            orderBy: {
              number: "desc"
            },
            include: {
              videoEntry: {
                select: {
                  youtubeVideoId: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!room) {
    throw new Error("Room not found.");
  }

  if (room.hostUserId !== hostUserId) {
    throw new Error("Only the host can start the game.");
  }

  if (room.status !== RoomStatus.LOBBY && room.status !== RoomStatus.FINISHED) {
    throw new Error("This room is not ready to start a new game.");
  }

  const readyPlayers = room.players.filter((player) => player.isReady);
  const activeVideoOwners = room.players.filter((player) => {
    const videoCount = room.videos.filter((video) => video.ownerPlayerId === player.id).length;
    return videoCount >= MIN_VIDEOS_PER_PLAYER;
  });

  const settings = room.settings as unknown as RoomSettings;
  logger.info(
    {
      roomCode,
      hostUserId,
      playerCount: room.players.length,
      readyPlayersCount: readyPlayers.length,
      activeVideoOwnersCount: activeVideoOwners.length,
      activeVideosCount: room.videos.length,
      totalRounds: settings.totalRounds
    },
    "Launch attempt received."
  );
  validateRoomCanStart(room.players.length, readyPlayers.length, activeVideoOwners.length, settings);

  const recentYoutubeVideoIds = room.games.flatMap((game) =>
    game.rounds
      .map((round) => round.videoEntry?.youtubeVideoId)
      .filter((youtubeVideoId): youtubeVideoId is string => Boolean(youtubeVideoId))
  );
  const recentYoutubeVideoIdSet = new Set(recentYoutubeVideoIds);
  const eligibleFreshVideosCount = room.videos.filter((video) => !recentYoutubeVideoIdSet.has(video.youtubeVideoId)).length;

  const deck = buildDeck(
    room.videos.map((video) => ({
      id: video.id,
      ownerPlayerId: video.ownerPlayerId,
      youtubeVideoId: video.youtubeVideoId
    })),
    settings,
    {
      recentYoutubeVideoIds
    }
  );
  const deckOwnerDistribution = deck.reduce<Record<string, number>>((distribution, entry) => {
    distribution[entry.ownerPlayerId] = (distribution[entry.ownerPlayerId] ?? 0) + 1;
    return distribution;
  }, {});
  logger.info(
    {
      roomCode,
      recentYoutubeVideoIdsCount: recentYoutubeVideoIds.length,
      eligibleFreshVideosCount,
      recentExcludedCount: room.videos.length - eligibleFreshVideosCount,
      deckOwnerDistribution,
      deckOwnerSequence: deck.map((entry) => entry.ownerPlayerId),
      selectedYoutubeVideoIds: deck.map((entry) => {
        const match = room.videos.find((video) => video.id === entry.videoId);
        return match?.youtubeVideoId ?? entry.videoId;
      }),
      selectedVideoIds: deck.map((entry) => entry.videoId),
      totalRounds: deck.length
    },
    "Built a balanced deck for the game."
  );

  const now = new Date();
  const firstRoundEndsAt = getRoundDeadline(now, settings);

  const started = await prisma.$transaction(async (tx) => {
    const claimedRoom = await tx.room.updateMany({
      where: {
        id: room.id,
        status: {
          in: [RoomStatus.LOBBY, RoomStatus.FINISHED]
        }
      },
      data: {
        status: RoomStatus.IN_GAME
      }
    });

    if (claimedRoom.count === 0) {
      return null;
    }

    const game = await tx.game.create({
      data: {
        roomId: room.id,
        createdByUserId: hostUserId,
        status: GameStatus.IN_PROGRESS,
        totalRounds: settings.totalRounds,
        currentRoundNumber: 1,
        startedAt: now,
        rounds: {
          create: deck.map((entry, index) => ({
            number: index + 1,
            status: index === 0 ? RoundStatus.ACTIVE : RoundStatus.PENDING,
            videoEntryId: entry.videoId,
            sourcePlayerId: entry.ownerPlayerId,
            startedAt: index === 0 ? now : null,
            endsAt: index === 0 ? firstRoundEndsAt : null
          }))
        }
      }
    });

    await tx.roomPlayer.updateMany({
      where: {
        roomId: room.id
      },
      data: {
        currentScore: 0,
        currentCorrectAnswers: 0,
        isReady: false
      }
    });

    return game;
  });

  if (!started) {
    throw new Error("This room has already been started by another instance.");
  }

  const firstRound = await prisma.round.findFirstOrThrow({
    where: {
      gameId: started.id,
      number: 1
    }
  });

  logger.info(
    {
      roomCode,
      hostUserId,
      gameId: started.id,
      roundsCreated: deck.length,
      firstRoundId: firstRound.id,
      firstRoundEndsAt: firstRoundEndsAt.toISOString(),
      firstRoundDurationMs: firstRoundEndsAt.getTime() - now.getTime()
    },
    "Game created and rounds initialized."
  );
  await emitRoomState(roomCode);
  await scheduleRoundEnd(firstRound.id, roomCode, firstRoundEndsAt.getTime() - Date.now());
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error("Missing authentication token."));
    }

    const verified = await jwtVerify(token, jwtSecret);
    socket.data.user = {
      userId: String(verified.payload.sub),
      roomCode: String(verified.payload.roomCode),
      roomPlayerId: String(verified.payload.roomPlayerId),
      name: String(verified.payload.name),
      image: verified.payload.image ? String(verified.payload.image) : null
    } satisfies SocketUser;

    return next();
  } catch (error) {
    logger.warn({ error }, "Socket authentication failed.");
    return next(error instanceof Error ? error : new Error("Invalid authentication token."));
  }
});

io.on("connection", (socket) => {
  const user = socket.data.user as SocketUser;
  logger.info({ socketId: socket.id, roomCode: user.roomCode, userId: user.userId }, "Socket connected.");

  async function syncPresence(connected: boolean) {
    const roomPlayer = await prisma.roomPlayer.findUnique({
      where: {
        id: user.roomPlayerId
      }
    });

    if (!roomPlayer) {
      return;
    }

    await prisma.roomPlayer.update({
      where: {
        id: user.roomPlayerId
      },
      data: {
        isConnected: connected,
        socketId: connected ? socket.id : null,
        lastSeenAt: new Date(),
        disconnectedAt: connected ? null : new Date()
      }
    });

    await prisma.room.update({
      where: {
        id: roomPlayer.roomId
      },
      data: {
        updatedAt: new Date()
      }
    });

    logger.info(
      {
        roomCode: user.roomCode,
        userId: user.userId,
        roomPlayerId: user.roomPlayerId,
        connected,
        socketId: connected ? socket.id : null
      },
      "Room presence persisted."
    );

    if (connected) {
      clearInterruptionTimer(roomPlayer.roomId);
      logger.info({ roomId: roomPlayer.roomId, roomCode: user.roomCode, userId: user.userId }, "Cleared pending interruption timer after reconnect.");
    }
  }

  logger.info({ socketId: socket.id, roomCode: user.roomCode, userId: user.userId }, "Joining socket room.");
  socket.join(user.roomCode);

  void (async () => {
    await syncPresence(true);
    await emitRoomState(user.roomCode);
  })();

  socket.on(SOCKET_EVENTS.roomReady, async (payload: { isReady: boolean }) => {
    try {
      logger.info(
        {
          roomCode: user.roomCode,
          userId: user.userId,
          roomPlayerId: user.roomPlayerId,
          requestedReadyState: payload.isReady
        },
        "Ready toggle request received."
      );

      const roomPlayer = await prisma.roomPlayer.findUnique({
        where: {
          id: user.roomPlayerId
        },
        include: {
          room: true,
          ownedVideos: {
            where: {
              isActive: true
            }
          }
        }
      });

      if (!roomPlayer || roomPlayer.room.status !== RoomStatus.LOBBY) {
        throw new Error("Ready state can only be changed in the lobby.");
      }

      if (payload.isReady && roomPlayer.ownedVideos.length < MIN_VIDEOS_PER_PLAYER) {
        throw new Error(`You need at least ${MIN_VIDEOS_PER_PLAYER} videos to mark yourself ready.`);
      }

      await prisma.roomPlayer.update({
        where: {
          id: user.roomPlayerId
        },
        data: {
          isReady: payload.isReady,
          isConnected: true,
          lastSeenAt: new Date()
        }
      });

      logger.info(
        {
          roomCode: user.roomCode,
          userId: user.userId,
          roomPlayerId: user.roomPlayerId,
          isReady: payload.isReady
        },
        "Ready state persisted."
      );
      await emitRoomState(user.roomCode);
    } catch (error) {
      logger.warn({ error, roomCode: user.roomCode, userId: user.userId }, "Unable to update ready state.");
      Sentry.captureException(error);
      socket.emit(SOCKET_EVENTS.error, {
        message: error instanceof Error ? error.message : "Unable to update ready state."
      });
    }
  });

  socket.on(SOCKET_EVENTS.gameStart, async () => {
    try {
      logger.info(
        {
          roomCode: user.roomCode,
          userId: user.userId,
          roomPlayerId: user.roomPlayerId
        },
        "Game launch requested by client."
      );
      await startGame(user.roomCode, user.userId);
    } catch (error) {
      logger.warn({ error, roomCode: user.roomCode, userId: user.userId }, "Unable to start game.");
      Sentry.captureException(error);
      socket.emit(SOCKET_EVENTS.error, {
        message: error instanceof Error ? error.message : "Unable to start the game."
      });
    }
  });

  socket.on(SOCKET_EVENTS.answerSubmit, async (payload: { roundId: string; guessedPlayerId: string }) => {
    try {
      const round = await prisma.round.findUnique({
        where: {
          id: payload.roundId
        },
        include: {
          game: {
            include: {
              room: {
                include: {
                  players: true
                }
              }
            }
          },
          answers: true
        }
      });

      if (!round || round.status !== RoundStatus.ACTIVE) {
        throw new Error("This round is not accepting answers anymore.");
      }

      const player = round.game.room.players.find((roomPlayer) => roomPlayer.id === user.roomPlayerId);
      if (!player) {
        throw new Error("You are not part of this room.");
      }

      const guessedPlayer = round.game.room.players.find((roomPlayer) => roomPlayer.id === payload.guessedPlayerId);
      if (!guessedPlayer) {
        throw new Error("Invalid guessed player.");
      }

      if (round.sourcePlayerId === user.roomPlayerId) {
        throw new Error("You cannot answer a round that uses your own video.");
      }

      if (!player.isConnected) {
        throw new Error("Reconnect before answering.");
      }

      const alreadyAnswered = round.answers.some((answer) => answer.playerId === user.roomPlayerId);
      if (alreadyAnswered) {
        throw new Error("You have already answered this round.");
      }

      const startedAt = round.startedAt?.getTime() ?? Date.now();
      const responseTimeMs = Math.max(0, Date.now() - startedAt);

      await prisma.answer.create({
        data: {
          roundId: round.id,
          playerId: user.roomPlayerId,
          guessedPlayerId: payload.guessedPlayerId,
          isCorrect: payload.guessedPlayerId === round.sourcePlayerId,
          responseTimeMs
        }
      });

      logger.info(
        {
          roomCode: user.roomCode,
          roundId: round.id,
          userId: user.userId,
          guessedPlayerId: payload.guessedPlayerId,
          responseTimeMs,
          answersBeforeInsert: round.answers.length
        },
        "Answer submitted."
      );

      const connectedPlayers = round.game.room.players.filter(
        (roomPlayer) => roomPlayer.isConnected && roomPlayer.id !== round.sourcePlayerId
      );
      logger.info(
        {
          roomCode: user.roomCode,
          roundId: round.id,
          connectedPlayers: connectedPlayers.length,
          answersAfterInsert: round.answers.length + 1,
          revealAt: round.endsAt?.toISOString() ?? null
        },
        "Answer stored. Round remains active until the fixed timer expires."
      );
      await emitRoomState(user.roomCode);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        socket.emit(SOCKET_EVENTS.error, {
          message: "You have already answered this round."
        });
        return;
      }

      logger.warn({ error, roomCode: user.roomCode, userId: user.userId }, "Unable to submit answer.");
      Sentry.captureException(error);
      socket.emit(SOCKET_EVENTS.error, {
        message: error instanceof Error ? error.message : "Unable to submit answer."
      });
    }
  });

  socket.on("disconnect", () => {
    void (async () => {
      try {
        await syncPresence(false);
        const roomPlayer = await prisma.roomPlayer.findUnique({
          where: {
            id: user.roomPlayerId
          }
        });

        if (roomPlayer) {
          const room = await prisma.room.findUnique({
            where: {
              id: roomPlayer.roomId
            }
          });

          if (room) {
            if (room.status !== RoomStatus.IN_GAME) {
              const connectedHost = await prisma.roomPlayer.findFirst({
                where: {
                  roomId: room.id,
                  userId: room.hostUserId,
                  isConnected: true
                }
              });

              if (!connectedHost) {
                const nextHost = await prisma.roomPlayer.findFirst({
                  where: {
                    roomId: room.id,
                    isConnected: true
                  },
                  orderBy: {
                    joinedAt: "asc"
                  }
                });

                if (nextHost) {
                  await prisma.room.update({
                    where: {
                      id: room.id
                    },
                    data: {
                      hostUserId: nextHost.userId
                    }
                  });

                  logger.info({ roomCode: user.roomCode, newHostUserId: nextHost.userId }, "Host transferred.");
                }
              }
            }

            if (room.status === RoomStatus.IN_GAME) {
              scheduleInterruptIfNotEnoughPlayers(room.id, user.roomCode, "players_disconnected_during_active_game");
            }
          }
        }

        logger.info({ socketId: socket.id, roomCode: user.roomCode, userId: user.userId }, "Socket disconnected.");
        await emitRoomState(user.roomCode);
      } catch (error) {
        logger.error({ error, roomCode: user.roomCode, userId: user.userId }, "Disconnect handling failed.");
        Sentry.captureException(error);
      }
    })();
  });
});

void (async () => {
  try {
    await setupRedisAdapter();

    httpServer.listen(env.port, () => {
      logger.info({ port: env.port, clientUrl: env.clientUrl }, "Realtime server listening.");
    });
  } catch (error) {
    logger.fatal({ error }, "Unable to boot realtime server.");
    Sentry.captureException(error);
    process.exit(1);
  }
})();
