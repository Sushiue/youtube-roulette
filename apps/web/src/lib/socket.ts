"use client";

import { io, type Socket } from "socket.io-client";

const SOCKET_CONNECT_TIMEOUT_MS = 8_000;

export async function connectRoomSocket(roomCode: string): Promise<Socket> {
  const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_SERVER_URL;
  if (!realtimeUrl) {
    throw new Error("NEXT_PUBLIC_REALTIME_SERVER_URL is not configured.");
  }

  const response = await fetch("/api/realtime/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roomCode
    })
  });

  const payload = await response.json();
  if (!response.ok || !payload.token) {
    throw new Error(payload.error ?? "Unable to obtain realtime token.");
  }

  const socket = io(realtimeUrl, {
    transports: ["websocket"],
    autoConnect: false,
    auth: {
      token: payload.token
    }
  }) as Socket;

  return await new Promise<Socket>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      socket.close();
      reject(new Error("Realtime connection timed out."));
    }, SOCKET_CONNECT_TIMEOUT_MS);

    const handleConnect = () => {
      cleanup();
      resolve(socket);
    };

    const handleConnectError = (error: Error) => {
      cleanup();
      socket.close();
      reject(error);
    };

    function cleanup() {
      window.clearTimeout(timeout);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
    }

    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
    socket.connect();
  });
}
