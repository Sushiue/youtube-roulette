import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="text-center">
        <p className="text-sm uppercase tracking-[0.28em] text-accentSoft">404</p>
        <h1 className="mt-4 font-display text-4xl text-white">This room or game could not be found.</h1>
        <p className="mt-4 text-sm leading-7 text-cream/65">
          The code may be invalid, the game may have ended, or you may not be part of this room.
        </p>
        <div className="mt-8">
          <Link href="/rooms">
            <Button>Back to rooms</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
