import { redirect } from "next/navigation";
import { ShieldCheck, Youtube } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { SignInButton } from "@/components/home/sign-in-button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/rooms");
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Card className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-accentSoft">Secure sign-in</p>
          <h1 className="mt-4 font-display text-5xl text-white">Connect Google to unlock your YouTube account videos.</h1>
          <p className="mt-5 text-base leading-8 text-cream/70">
            The app requests Google profile info and YouTube read access so it can try your liked videos, playlists, and channel uploads for the party game.
          </p>
          <div className="mt-8">
            <SignInButton />
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <Youtube className="h-7 w-7 text-accentSoft" />
            <p className="mt-4 text-sm leading-6 text-cream/70">
              Primary mode: try liked videos first, then playlists, then recent uploads from the YouTube channel linked to your Google account.
            </p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <ShieldCheck className="h-7 w-7 text-accentSoft" />
            <p className="mt-4 text-sm leading-6 text-cream/70">
              Secrets stay server-side. Tokens are refreshed safely and room membership is validated on every sensitive route.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
