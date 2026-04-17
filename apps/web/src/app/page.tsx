import Link from "next/link";
import { ArrowRight, TimerReset, Trophy, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/components/home/sign-in-button";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-[40px] border border-white/10 bg-radial-stage px-6 py-12 sm:px-10 lg:px-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-accentSoft">Realtime birthday party game</p>
            <h1 className="mt-5 max-w-4xl font-display text-5xl leading-none text-white sm:text-6xl">
              Guess which friend this YouTube video belongs to before the clock runs out.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-cream/72">
              Authenticate with Google, import videos from your YouTube account, gather everyone into a private room, then battle through ten rounds with live scores and a final podium.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {session ? (
                <Link href="/rooms">
                  <Button className="gap-2">
                    Open rooms
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <SignInButton />
              )}
              <a
                href="#features"
                className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-cream/70 transition hover:border-accent/60 hover:text-white"
              >
                See the flow
              </a>
            </div>
          </div>

          <Card className="border-accent/20 bg-black/30">
            <div className="grid gap-4">
              {[
                "1. Every player signs in with Google and grants YouTube read access.",
                "2. The host creates a room and shares the short code.",
                "3. Everyone imports account videos or adds manual fallback videos.",
                "4. Ten rounds reveal one video at a time with live guessing.",
                "5. Fast answers score extra points, then the podium closes the night."
              ].map((line) => (
                <div key={line} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-cream/78">
                  {line}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section id="features" className="grid gap-6 md:grid-cols-3">
        <Card>
          <Users className="h-8 w-8 text-accentSoft" />
          <h2 className="mt-6 font-display text-2xl text-white">Private rooms</h2>
          <p className="mt-3 text-sm leading-6 text-cream/65">
            Invite friends remotely into the same lobby, track readiness, and keep the host in control of the start.
          </p>
        </Card>
        <Card>
          <TimerReset className="h-8 w-8 text-accentSoft" />
          <h2 className="mt-6 font-display text-2xl text-white">Live rounds</h2>
          <p className="mt-3 text-sm leading-6 text-cream/65">
            Every answer, reveal, disconnect, reconnect, and score update is synchronized in real time.
          </p>
        </Card>
        <Card>
          <Trophy className="h-8 w-8 text-accentSoft" />
          <h2 className="mt-6 font-display text-2xl text-white">Final podium</h2>
          <p className="mt-3 text-sm leading-6 text-cream/65">
            Finish with a full ranking, top three podium, and replay support in the same room for another round.
          </p>
        </Card>
      </section>
    </div>
  );
}
