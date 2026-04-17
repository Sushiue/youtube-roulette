import Link from "next/link";
import type { PublicPlayer } from "@youtube-roulette/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

export function ResultsClient({
  roomCode,
  podium,
  players
}: {
  roomCode: string;
  podium: PublicPlayer[];
  players: PublicPlayer[];
}) {
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-b from-accent/12 to-transparent">
        <p className="text-center text-xs uppercase tracking-[0.26em] text-accentSoft">Final podium</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {podium.map((player, index) => (
            <div
              key={player.id}
              className={`rounded-[32px] border border-white/10 p-6 text-center ${index === 0 ? "bg-white/10 md:-translate-y-4" : "bg-white/5"}`}
            >
              <div className="mx-auto flex w-fit justify-center">
                <Avatar src={player.image} alt={player.name} size={72} />
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.24em] text-cream/45">#{index + 1}</p>
              <h2 className="mt-2 font-display text-3xl text-white">{player.name}</h2>
              <p className="mt-2 text-lg text-cream/70">{player.score} points</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-2xl text-white">Full ranking</h2>
        <div className="mt-6 space-y-3">
          {players.map((player, index) => (
            <div key={player.id} className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 font-display text-xl text-white">
                  {index + 1}
                </div>
                <Avatar src={player.image} alt={player.name} size={44} />
                <div>
                  <p className="font-medium text-white">{player.name}</p>
                  <p className="text-sm text-cream/50">{player.correctAnswers} correct answers</p>
                </div>
              </div>
              <p className="font-display text-3xl text-white">{player.score}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/room/${roomCode}`}>
            <Button>Back to room</Button>
          </Link>
          <Link href="/rooms">
            <Button variant="secondary">Create another party</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
