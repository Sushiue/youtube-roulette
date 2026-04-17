"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateJoinRoomPanel() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function createRoom() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Unable to create a room.");
        return;
      }

      router.push(`/room/${payload.roomCode}`);
    });
  }

  function joinRoom() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: joinCode.trim().toUpperCase()
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Unable to join this room.");
        return;
      }

      router.push(payload.redirectTo ?? `/room/${payload.roomCode}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-accent/20 bg-gradient-to-br from-accent/12 to-transparent">
        <div className="mb-6 inline-flex rounded-2xl bg-white/10 p-3">
          <Plus className="h-6 w-6 text-white" />
        </div>
        <h2 className="font-display text-3xl text-white">Create a private room</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-cream/70">
          Start a new party lobby, import videos from your YouTube account, invite friends with a short code, then launch the game when everyone is ready.
        </p>
        <Button className="mt-8" onClick={createRoom} disabled={isPending}>
          Create room
        </Button>
      </Card>

      <Card>
        <div className="mb-6 inline-flex rounded-2xl bg-white/10 p-3">
          <Users className="h-6 w-6 text-white" />
        </div>
        <h2 className="font-display text-3xl text-white">Join an existing room</h2>
        <p className="mt-3 text-sm leading-6 text-cream/70">
          Paste the code shared by the host to drop directly into the lobby or reconnect to an ongoing game.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={6}
          />
          <Button variant="secondary" onClick={joinRoom} disabled={isPending || joinCode.trim().length < 4}>
            Join room
          </Button>
        </div>
        {message ? <p className="mt-4 text-sm text-red-200">{message}</p> : null}
      </Card>
    </div>
  );
}
