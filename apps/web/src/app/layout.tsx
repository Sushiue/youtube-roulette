import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Space_Grotesk } from "next/font/google";
import { auth } from "@/lib/auth";
import { AppProviders } from "@/components/providers/app-providers";
import { SiteHeader } from "@/components/layout/site-header";
import "@/app/globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage"
});

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space"
});

export const metadata: Metadata = {
  title: "YouTube Roulette",
  description: "Realtime multiplayer party game powered by videos imported from a YouTube account."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className={`${bricolage.variable} ${space.variable}`}>
      <body>
        <AppProviders session={session}>
          <SiteHeader />
          <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
