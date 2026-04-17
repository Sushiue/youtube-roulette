"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS, type PublicRoomState } from "@youtube-roulette/shared";
import { connectRoomSocket } from "@/lib/socket";
import { formatTimeLeft } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";

type SocketStatus = "connecting" | "connected" | "disconnected" | "error";

export function GameClient({
  initialRoomState,
  currentUserId,
  ownedVideoIds
}: {
  initialRoomState: PublicRoomState;
  currentUserId: string;
  ownedVideoIds: string[];
}) {
  const router = useRouter();
  const [roomState, setRoomState] = useState(initialRoomState);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const activeRound = useMemo(() => {
    const rounds = roomState.game?.rounds ?? [];
    return rounds.find((round) => round.status === "ACTIVE") ?? null;
  }, [roomState.game?.rounds]);

  const latestRevealedRound = useMemo(() => {
    const rounds = roomState.game?.rounds ?? [];
    return [...rounds].reverse().find((round) => round.status === "REVEALED") ?? null;
  }, [roomState.game?.rounds]);

  const currentRound = activeRound ?? latestRevealedRound;
  const isRoundTransition = !activeRound && !latestRevealedRound && roomState.game?.status === "IN_PROGRESS";

  const me = roomState.players.find((player) => player.userId === currentUserId) ?? null;
  const myAnswer = currentRound?.answers.find((answer) => answer.playerId === me?.id);
  const isOwnVideoRound = Boolean(currentRound?.status === "ACTIVE" && currentRound.video && ownedVideoIds.includes(currentRound.video.id));
  const isAnswerLocked =
    !currentRound ||
    currentRound.status !== "ACTIVE" ||
    Boolean(myAnswer) ||
    socketStatus !== "connected" ||
    isOwnVideoRound;
  const revealOwner = currentRound?.sourcePlayerId
    ? roomState.players.find((player) => player.id === currentRound.sourcePlayerId) ?? null
    : null;

  const refreshState = useCallback(async (reason = "manual_refresh") => {
    console.info("Client game state refresh requested", {
      roomCode: roomState.code,
      reason
    });

    const latestRoomState = await fetch(`/api/rooms/${roomState.code}/state`);
    if (!latestRoomState.ok) {
      console.warn("Client game state refresh failed", {
        roomCode: roomState.code,
        reason,
        status: latestRoomState.status
      });
      return;
    }

    const nextRoomState = (await latestRoomState.json()) as PublicRoomState;
    console.info("Client game state refreshed", {
      roomCode: roomState.code,
      reason,
      gameStatus: nextRoomState.game?.status ?? null,
      currentRoundNumber: nextRoomState.game?.currentRoundNumber ?? null
    });
    setRoomState(nextRoomState);
  }, [roomState.code]);

  useEffect(() => {
    let mounted = true;
    let activeSocket: Socket | null = null;

    void (async () => {
      try {
        setSocketStatus("connecting");
        const nextSocket = await connectRoomSocket(roomState.code);
        if (!mounted) {
          nextSocket.close();
          return;
        }

        activeSocket = nextSocket;
        setSocket(nextSocket);
        setSocketStatus("connected");

        const handleConnect = () => {
          if (!mounted) {
            return;
          }

          setSocketStatus("connected");
          setMessage(null);
          console.info("Game socket connected", {
            roomCode: roomState.code,
            socketId: nextSocket.id ?? null
          });
          void refreshState("socket_connect");
        };

        const handleDisconnect = (reason: string) => {
          if (!mounted) {
            return;
          }

          setSocketStatus("disconnected");
          console.warn("Game socket disconnected", {
            roomCode: roomState.code,
            reason
          });
        };

        const handleConnectError = (error: Error) => {
          if (!mounted) {
            return;
          }

          setSocketStatus("error");
          console.error("Game socket connection error", {
            roomCode: roomState.code,
            message: error.message
          });
          setMessage("Realtime connection failed during the game. Refresh after checking both server secrets.");
        };

        nextSocket.on("connect", handleConnect);
        nextSocket.on("disconnect", handleDisconnect);
        nextSocket.on("connect_error", handleConnectError);

        nextSocket.on(SOCKET_EVENTS.roomState, (state: PublicRoomState) => {
          console.info("Game room state event received", {
            roomCode: state.code,
            gameStatus: state.game?.status ?? null,
            currentRoundNumber: state.game?.currentRoundNumber ?? null
          });
          setRoomState(state);
          if (state.game?.status === "FINISHED" || state.game?.status === "INTERRUPTED") {
            router.replace(`/results/${state.game.id}`);
          }
        });

        nextSocket.on(SOCKET_EVENTS.error, (payload: { message?: string }) => {
          setMessage(payload.message ?? "Realtime connection issue.");
        });

        if (nextSocket.connected) {
          handleConnect();
        }
      } catch (error) {
        setSocketStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to connect to realtime server.");
      }
    })();

    return () => {
      mounted = false;
      activeSocket?.close();
    };
  }, [refreshState, roomState.code, router]);

  useEffect(() => {
    if (!currentRound?.endsAt) {
      setTimeLeft(0);
      return;
    }

    const interval = window.setInterval(() => {
      setTimeLeft(new Date(currentRound.endsAt as string).getTime() - Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [currentRound?.endsAt]);

  function submitAnswer(guessedPlayerId: string) {
    if (!currentRound) {
      return;
    }

    if (!socket?.connected) {
      setMessage("Realtime connection is not ready yet. Reconnect before answering.");
      return;
    }

    console.info("Answer submission requested", {
      roomCode: roomState.code,
      roundId: currentRound.id,
      guessedPlayerId
    });
    setMessage(null);
    socket?.emit(SOCKET_EVENTS.answerSubmit, {
      roundId: currentRound.id,
      guessedPlayerId
    });
  }

  function describePoints(pointsAwarded: number, isCorrect: boolean) {
    if (!isCorrect) {
      return "Wrong guess, +0";
    }

    if (pointsAwarded >= 2) {
      return "Correct guess, +2 including fastest bonus";
    }

    if (pointsAwarded === 1) {
      return "Correct guess, +1";
    }

    return "Correct guess, +0";
  }

  const revealRows =
    currentRound && currentRound.status !== "ACTIVE"
      ? roomState.players.map((player) => {
          const answer = currentRound.answers.find((entry) => entry.playerId === player.id) ?? null;
          const guessedPlayer = answer
            ? roomState.players.find((entry) => entry.id === answer.guessedPlayerId) ?? null
            : null;

          return {
            player,
            answer,
            guessedPlayer,
            isOwner: currentRound.sourcePlayerId === player.id
          };
        })
      : [];

  if (!roomState.game) {
    return (
      <Card>
        <p className="text-white">Game state is loading...</p>
      </Card>
    );
  }

  const rankedPlayers = [...roomState.players].sort((a, b) => {
    if (b.score === a.score) {
      return b.correctAnswers - a.correctAnswers;
    }

    return b.score - a.score;
  });

  if (!currentRound && isRoundTransition) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.7fr_0.7fr]">
        <Card className="min-h-[60vh] bg-gradient-to-br from-white/6 to-transparent">
          <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
            <StatusPill label="Next round loading" tone="warning" />
            <h1 className="mt-6 font-display text-5xl text-white">Prepare for the next video</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-cream/70">
              Scores are locked in. The next round will appear automatically as soon as the realtime state is ready.
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Live scoreboard</p>
          <div className="mt-5 space-y-3">
            {rankedPlayers.map((player, index) => (
              <div key={player.id} className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 font-display text-lg text-white">
                    {index + 1}
                  </div>
                  <Avatar src={player.image} alt={player.name} size={40} />
                  <div>
                    <p className="font-medium text-white">{player.name}</p>
                    <p className="text-xs text-cream/45">{player.correctAnswers} correct answers</p>
                  </div>
                </div>
                <p className="font-display text-3xl text-white">{player.score}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!currentRound) {
    return (
      <Card>
        <p className="text-white">Waiting for the next round state...</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[2.1fr_0.7fr]">
      <div className="space-y-6">
        <Card className="overflow-hidden p-0">
          {currentRound.video ? (
            <div>
              <div className="bg-black">
                <iframe
                  key={currentRound.video.youtubeVideoId}
                  title={currentRound.video.title}
                  src={`${currentRound.video.embedUrl}?rel=0&modestbranding=1`}
                  className="aspect-video min-h-[420px] w-full lg:min-h-[580px] xl:min-h-[700px]"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="space-y-5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusPill label={`Round ${currentRound.number} / ${roomState.game.totalRounds}`} tone="warning" />
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      label={socketStatus === "connected" ? "Realtime connected" : socketStatus === "connecting" ? "Realtime connecting" : "Realtime unavailable"}
                      tone={socketStatus === "connected" ? "success" : socketStatus === "connecting" ? "warning" : "danger"}
                    />
                    <StatusPill
                      label={currentRound.status === "ACTIVE" ? formatTimeLeft(timeLeft) : "Reveal"}
                      tone={currentRound.status === "ACTIVE" ? "danger" : "default"}
                    />
                  </div>
                </div>

                <div>
                  <h1 className="font-display text-4xl text-white lg:text-5xl">{currentRound.video.title}</h1>
                  <p className="mt-3 text-base text-cream/60">{currentRound.video.channelTitle}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Round Status</p>
                    <p className="mt-3 text-base leading-7 text-cream/80">
                      {currentRound.status === "ACTIVE"
                        ? isOwnVideoRound
                          ? "This is your own video. Sit this round out while everyone else guesses."
                          : myAnswer
                          ? `Your answer is locked in. The reveal happens when the 30-second timer ends.`
                          : "Pick the friend this video belongs to before the 30-second timer expires."
                        : `Reveal: this video belonged to ${currentRound.video.ownerName}.`}
                    </p>
                    {isOwnVideoRound ? (
                      <div className="mt-4 inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100">
                        This is your own video
                      </div>
                    ) : null}
                    {currentRound.status !== "ACTIVE" && myAnswer ? (
                      <p className="mt-3 text-sm font-medium text-white">
                        {describePoints(myAnswer.pointsAwarded, myAnswer.isCorrect)}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Video Actions</p>
                    <a
                      href={currentRound.video.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-semibold text-accentSoft transition hover:text-white"
                    >
                      Open on YouTube
                    </a>
                    {message ? <p className="mt-4 text-sm text-red-200">{message}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-white">Waiting for the round video...</p>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-white">Whose video is this?</h2>
            {isOwnVideoRound ? <StatusPill label="Your video" tone="warning" /> : null}
            {!isOwnVideoRound && myAnswer ? <StatusPill label="Answer locked" tone="success" /> : null}
          </div>
          {isOwnVideoRound ? (
            <div className="mt-6 rounded-3xl border border-amber-400/25 bg-amber-500/10 px-5 py-4">
              <p className="text-sm font-semibold text-amber-100">This is your own video.</p>
              <p className="mt-2 text-sm leading-6 text-amber-50/80">
                Answers are disabled for this round. Watch the guesses come in and wait for the reveal at the end of the timer.
              </p>
            </div>
          ) : null}
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {roomState.players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => submitAnswer(player.id)}
                disabled={isAnswerLocked}
                className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-accent/40 hover:bg-white/8 disabled:cursor-not-allowed disabled:border-white/5 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Avatar src={player.image} alt={player.name} size={40} />
                  <div>
                    <p className="font-medium text-white">{player.name}</p>
                    <p className="text-xs text-cream/45">
                      {isOwnVideoRound ? "You sit this round out" : `${player.score} pts`}
                    </p>
                  </div>
                </div>
                {currentRound.status !== "ACTIVE" && currentRound.sourcePlayerId === player.id ? (
                  <StatusPill label="Video owner" tone="success" />
                ) : null}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Live scoreboard</p>
          <div className="mt-5 space-y-3">
            {rankedPlayers.map((player, index) => (
              <div key={player.id} className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 font-display text-lg text-white">
                    {index + 1}
                  </div>
                  <Avatar src={player.image} alt={player.name} size={40} />
                  <div>
                    <p className="font-medium text-white">{player.name}</p>
                    <p className="text-xs text-cream/45">{player.correctAnswers} correct answers</p>
                  </div>
                </div>
                <p className="font-display text-3xl text-white">{player.score}</p>
              </div>
            ))}
          </div>
        </Card>

        {currentRound.status !== "ACTIVE" ? (
          <Card>
            <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Round Reveal</p>
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-cream/60">Real owner</p>
              <div className="mt-3 flex items-center gap-3">
                {revealOwner ? <Avatar src={revealOwner.image} alt={revealOwner.name} size={44} /> : null}
                <div>
                  <p className="font-medium text-white">{revealOwner?.name ?? "Unknown player"}</p>
                  <p className="text-xs text-cream/45">This video was theirs.</p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {revealRows.map(({ player, answer, guessedPlayer, isOwner }) => (
                <div key={player.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={player.image} alt={player.name} size={40} />
                      <div>
                        <p className="font-medium text-white">{player.name}</p>
                        <p className="text-xs text-cream/45">
                          {isOwner
                            ? "Video owner"
                            : answer
                              ? `Guessed ${guessedPlayer?.name ?? "Unknown player"}`
                              : "No answer submitted"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">
                        {isOwner ? "Owner" : answer ? `+${answer.pointsAwarded}` : "+0"}
                      </p>
                      <p className="text-xs text-cream/45">
                        {isOwner
                          ? "No answer expected"
                          : answer
                            ? answer.isCorrect
                              ? answer.pointsAwarded > 1
                                ? "Correct + fastest bonus"
                                : "Correct answer"
                              : "Wrong answer"
                            : "No answer"}
                      </p>
                    </div>
                  </div>
                  {!isOwner ? (
                    <div className="mt-3 flex items-center justify-between text-xs text-cream/55">
                      <span>{answer ? describePoints(answer.pointsAwarded, answer.isCorrect) : "No answer, +0"}</span>
                      <span>Total score: {player.score}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ) : currentRound.video ? (
          <Card>
            <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Fallback preview</p>
            <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
              <div className="relative aspect-video">
                <Image
                  src={currentRound.video.thumbnailUrl}
                  alt={currentRound.video.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-4">
                <p className="font-medium text-white">{currentRound.video.title}</p>
                <p className="mt-2 text-sm text-cream/55">{currentRound.video.channelTitle}</p>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
