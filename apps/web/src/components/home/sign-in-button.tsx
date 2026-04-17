"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInButton({ className }: { className?: string }) {
  const authorizationParams = {
    prompt: "consent",
    access_type: "offline",
    response_type: "code",
    include_granted_scopes: "true",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/youtube.readonly"
    ].join(" ")
  } as const;

  return (
    <Button
      className={className}
      onClick={() => {
        console.info("Starting Google OAuth sign-in", {
          provider: "google",
          callbackUrl: "/rooms",
          authorizationParams
        });

        return signIn("google", {
          callbackUrl: "/rooms"
        }, authorizationParams);
      }}
    >
      Continue with Google & YouTube
    </Button>
  );
}
