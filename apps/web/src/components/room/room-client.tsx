"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Socket } from "socket.io-client";
import { MIN_PLAYERS, MIN_VIDEOS_PER_PLAYER, SOCKET_EVENTS, type PublicRoomState } from "@youtube-roulette/shared";
import { connectRoomSocket } from "@/lib/socket";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";

type SocketStatus = "connecting" | "connected" | "disconnected" | "error";

export function RoomClient({
  initialRoomState,
  currentUserId
}: {
  initialRoomState: PublicRoomState;
  currentUserId: string;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [roomState, setRoomState] = useState(initialRoomState);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [manualVideo, setManualVideo] = useState({
    url: "",
    title: "",
    thumbnailUrl: "",
    channelTitle: ""
  });
  const me = useMemo(
    () => roomState.players.find((player) => player.userId === currentUserId) ?? null,
    [currentUserId, roomState.players]
  );
  const isHost = roomState.hostUserId === currentUserId;
  const readyPlayersCount = roomState.players.filter((player) => player.isReady).length;
  const eligiblePlayersCount = roomState.players.filter((player) => player.videoCount >= MIN_VIDEOS_PER_PLAYER).length;
  const canToggleReady = Boolean(me) && (me?.videoCount ?? 0) >= MIN_VIDEOS_PER_PLAYER && socketStatus === "connected";
  const canStartGame =
    isHost &&
    socketStatus === "connected" &&
    roomState.players.length >= MIN_PLAYERS &&
    readyPlayersCount === roomState.players.length &&
    eligiblePlayersCount >= MIN_PLAYERS;

  useEffect(() => {
    console.info("RoomClient scope snapshot", {
      roomCode: roomState.code,
      userId: currentUserId,
      googleScopes: session?.googleScopes ?? null,
      hasGoogleAccessToken: Boolean(session?.googleAccessToken),
      authError: session?.authError ?? null
    });
  }, [currentUserId, roomState.code, session?.authError, session?.googleAccessToken, session?.googleScopes]);

  const refreshState = useCallback(async (reason = "manual_refresh") => {
    console.info("Client room state refresh requested", {
      roomCode: roomState.code,
      reason
    });

    const latestRoomState = await fetch(`/api/rooms/${roomState.code}/state`);
    if (!latestRoomState.ok) {
      console.warn("Client room state refresh failed", {
        roomCode: roomState.code,
        reason,
        status: latestRoomState.status
      });
      return;
    }

    const nextRoomState = (await latestRoomState.json()) as PublicRoomState;
    console.info("Client room state refreshed", {
      roomCode: roomState.code,
      reason,
      playerCount: nextRoomState.players.length,
      readyPlayersCount: nextRoomState.players.filter((player) => player.isReady).length,
      gameStatus: nextRoomState.game?.status ?? null
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
          console.info("Room socket connected", {
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
          console.warn("Room socket disconnected", {
            roomCode: roomState.code,
            reason
          });
        };

        const handleConnectError = (error: Error) => {
          if (!mounted) {
            return;
          }

          setSocketStatus("error");
          console.error("Room socket connection error", {
            roomCode: roomState.code,
            message: error.message
          });
          setMessage("Realtime connection failed. Verify REALTIME_JWT_SECRET on both servers and restart web + realtime.");
        };

        nextSocket.on("connect", handleConnect);
        nextSocket.on("disconnect", handleDisconnect);
        nextSocket.on("connect_error", handleConnectError);

        nextSocket.on(SOCKET_EVENTS.roomState, (state: PublicRoomState) => {
          console.info("Room state event received", {
            roomCode: state.code,
            playerCount: state.players.length,
            readyPlayersCount: state.players.filter((player) => player.isReady).length,
            gameStatus: state.game?.status ?? null
          });
          setRoomState(state);

          if (state.game?.status === "IN_PROGRESS" && state.game.id) {
            router.replace(`/game/${state.game.id}`);
          }
        });

        nextSocket.on(SOCKET_EVENTS.error, (payload: { message?: string }) => {
          setMessage(payload.message ?? "A realtime error occurred.");
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

  async function syncRecentVideos() {
    setMessage(null);
    console.info("Starting YouTube account import", {
      roomCode: roomState.code,
      userId: currentUserId,
      googleScopes: session?.googleScopes ?? null,
      hasGoogleAccessToken: Boolean(session?.googleAccessToken),
      authError: session?.authError ?? null
    });

    const response = await fetch(`/api/rooms/${roomState.code}/videos/sync`, {
      method: "POST"
    });
    const payload = await response.json();
    setMessage(payload.message ?? payload.error ?? "YouTube account import finished.");
    await refreshState("youtube_import");
  }

  async function addManualVideo() {
    setMessage(null);
    const response = await fetch(`/api/rooms/${roomState.code}/videos/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(manualVideo)
    });

    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to add manual video.");
      return;
    }

    setManualVideo({
      url: "",
      title: "",
      thumbnailUrl: "",
      channelTitle: ""
    });
    setMessage("Manual video added to your pool.");
    await refreshState("manual_video_added");
  }

  async function leaveRoom() {
    await fetch(`/api/rooms/${roomState.code}/leave`, {
      method: "POST"
    });
    router.push("/rooms");
  }

  function toggleReady() {
    if (!socket?.connected || !me) {
      setMessage("Realtime connection is not ready yet. Wait a moment or reconnect.");
      return;
    }

    console.info("Ready toggle requested", {
      roomCode: roomState.code,
      userId: currentUserId,
      from: me.isReady,
      to: !me.isReady
    });
    setMessage(null);
    socket?.emit(SOCKET_EVENTS.roomReady, {
      isReady: !me?.isReady
    });
  }

  function startGame() {
    if (!socket?.connected) {
      setMessage("Realtime connection is not ready yet. Wait a moment or reconnect.");
      return;
    }

    console.info("Game launch requested", {
      roomCode: roomState.code,
      userId: currentUserId,
      playerCount: roomState.players.length,
      readyPlayersCount,
      eligiblePlayersCount
    });
    setMessage(null);
    socket?.emit(SOCKET_EVENTS.gameStart);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="bg-gradient-to-br from-white/6 to-transparent">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.26em] text-accentSoft">Private lobby</p>
              <h1 className="mt-3 font-display text-4xl text-white">Room {roomState.code}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-cream/70">
              Everyone needs at least {MIN_VIDEOS_PER_PLAYER} valid videos, then the host can launch the 10-round match.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label={`${roomState.players.length} players`} />
              <StatusPill label={`${roomState.videosReadyCount} videos imported`} tone="warning" />
              <StatusPill
                label={socketStatus === "connected" ? "Realtime connected" : socketStatus === "connecting" ? "Realtime connecting" : "Realtime unavailable"}
                tone={socketStatus === "connected" ? "success" : socketStatus === "connecting" ? "warning" : "danger"}
              />
            </div>
          </div>

          {message ? <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-cream/80">{message}</p> : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={syncRecentVideos}>Import videos from my YouTube account</Button>
            <Button variant="secondary" onClick={toggleReady} disabled={!canToggleReady}>
              {me?.isReady ? "Set not ready" : "Set ready"}
            </Button>
            {isHost ? (
              <Button variant="secondary" onClick={startGame} disabled={!canStartGame}>
                Launch the game
              </Button>
            ) : null}
            <Button variant="ghost" onClick={leaveRoom}>
              Leave room
            </Button>
          </div>
          <p className="mt-4 text-xs text-cream/50">
            Launch requires {roomState.players.length >= MIN_PLAYERS ? "all players ready" : "at least two players"}, at least two players with enough videos, and a live realtime connection.
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-cream/45">My import status</p>
          <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cream/60">Videos available</p>
                <p className="mt-2 font-display text-4xl text-white">{me?.videoCount ?? 0}</p>
              </div>
              <StatusPill
                label={me && me.videoCount >= MIN_VIDEOS_PER_PLAYER ? "Ready eligible" : "Need more videos"}
                tone={me && me.videoCount >= MIN_VIDEOS_PER_PLAYER ? "success" : "warning"}
              />
            </div>
          </div>
          <p className="mt-6 text-sm text-cream/60">
            The app builds a deeper private catalog from your YouTube account: it explores liked videos first, then playlists, then channel uploads. Each game still uses only 10 rounds from that larger catalog.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-white">Players in lobby</h2>
            <StatusPill label={isHost ? "You are host" : "Waiting for host"} />
          </div>
          <div className="mt-6 grid gap-3">
            {roomState.players.map((player) => (
              <div key={player.id} className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex items-center gap-4">
                  <Avatar src={player.image} alt={player.name} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{player.name}</p>
                      {player.isHost ? <StatusPill label="Host" /> : null}
                    </div>
                    <p className="text-sm text-cream/55">
                      {player.videoCount} videos ready
                      {player.userId === currentUserId ? " - you" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill label={player.isConnected ? "Online" : "Offline"} tone={player.isConnected ? "success" : "danger"} />
                  <StatusPill label={player.isReady ? "Ready" : "Not ready"} tone={player.isReady ? "success" : "warning"} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-2xl text-white">Manual fallback import</h2>
          <p className="mt-3 text-sm leading-6 text-cream/65">
            Use this if your connected YouTube account has no usable likes, playlists, or recent channel uploads for the room.
          </p>
          <div className="mt-6 space-y-3">
            <Input
              placeholder="YouTube URL"
              value={manualVideo.url}
              onChange={(event) => setManualVideo((current) => ({ ...current, url: event.target.value }))}
            />
            <Input
              placeholder="Video title"
              value={manualVideo.title}
              onChange={(event) => setManualVideo((current) => ({ ...current, title: event.target.value }))}
            />
            <Input
              placeholder="Thumbnail URL"
              value={manualVideo.thumbnailUrl}
              onChange={(event) => setManualVideo((current) => ({ ...current, thumbnailUrl: event.target.value }))}
            />
            <Input
              placeholder="Channel title"
              value={manualVideo.channelTitle}
              onChange={(event) => setManualVideo((current) => ({ ...current, channelTitle: event.target.value }))}
            />
            <Button
              onClick={addManualVideo}
              disabled={!manualVideo.url || !manualVideo.title || !manualVideo.thumbnailUrl || !manualVideo.channelTitle}
            >
              Add manual video
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
