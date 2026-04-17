"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

export function SiteHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-lg font-black text-white shadow-glow">
            YR
          </div>
          <div>
            <p className="font-display text-lg text-white">YouTube Roulette</p>
            <p className="text-xs uppercase tracking-[0.24em] text-cream/45">Birthday party edition</p>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link href="/rooms" className="text-sm text-cream/70 transition hover:text-white">
            Rooms
          </Link>
          {session?.user ? (
            <>
              <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 sm:flex">
                <Avatar src={session.user.image} alt={session.user.name ?? "Player"} size={32} />
                <div className="leading-tight">
                  <p className="text-sm font-medium text-white">{session.user.name}</p>
                  <p className="text-xs text-cream/45">{session.user.email}</p>
                </div>
              </div>
              <Button variant="secondary" className="px-4 py-2" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </Button>
            </>
          ) : (
            <Link href="/login" className="text-sm text-cream/70 transition hover:text-white">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
