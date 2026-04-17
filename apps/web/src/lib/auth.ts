import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { type NextAuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { mergeScopes } from "@/lib/youtube";

function previewToken(token?: string | null) {
  if (!token) {
    return undefined;
  }

  if (token.length <= 10) {
    return `${token.slice(0, 3)}...`;
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

async function refreshGoogleAccessToken(token: {
  refreshToken?: string;
  googleScopes?: string;
}) {
  if (!token.refreshToken) {
    return {
      accessToken: undefined,
      accessTokenExpires: undefined,
      refreshToken: undefined,
      googleScopes: token.googleScopes,
      authError: "MissingRefreshToken"
    };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken
      })
    });

    const refreshedTokens = await response.json();
    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      accessToken: refreshedTokens.access_token as string,
      accessTokenExpires: Date.now() + Number(refreshedTokens.expires_in) * 1000,
      refreshToken: (refreshedTokens.refresh_token as string | undefined) ?? token.refreshToken,
      googleScopes: (refreshedTokens.scope as string | undefined) ?? token.googleScopes,
      authError: undefined
    };
  } catch (error) {
    logger.error({ error }, "Failed to refresh Google access token.");

    return {
      accessToken: undefined,
      accessTokenExpires: undefined,
      refreshToken: token.refreshToken,
      googleScopes: token.googleScopes,
      authError: "RefreshAccessTokenError"
    };
  }
}

async function persistGoogleAccountState(params: {
  userId: string;
  account: {
    provider: string;
    providerAccountId?: string;
    type?: string;
    scope?: string | null;
    access_token?: string | null;
    refresh_token?: string | null;
    expires_at?: number | null;
    token_type?: string | null;
    id_token?: string | null;
    session_state?: string | null;
  };
}) {
  const { userId, account } = params;
  if (account.provider !== "google" || !account.providerAccountId) {
    return;
  }

  const existingAccount = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId
      }
    },
    select: {
      scope: true,
      refresh_token: true
    }
  });

  const nextScope = mergeScopes(existingAccount?.scope, account.scope);

  await db.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId
      }
    },
    create: {
      userId,
      type: account.type ?? "oauth",
      provider: "google",
      providerAccountId: account.providerAccountId,
      scope: nextScope || null,
      access_token: account.access_token ?? null,
      refresh_token: account.refresh_token ?? null,
      expires_at: account.expires_at ?? null,
      token_type: account.token_type ?? null,
      id_token: account.id_token ?? null,
      session_state: account.session_state ?? null
    },
    update: {
      userId,
      scope: nextScope || null,
      access_token: account.access_token ?? undefined,
      refresh_token: account.refresh_token ?? existingAccount?.refresh_token ?? undefined,
      expires_at: account.expires_at ?? undefined,
      token_type: account.token_type ?? undefined,
      id_token: account.id_token ?? undefined,
      session_state: account.session_state ?? undefined
    }
  });

  logger.info(
    {
      event: "google_account_scope_resynced",
      userId,
      providerAccountId: account.providerAccountId,
      scopeFromOAuth: account.scope,
      mergedScope: nextScope
    },
    "Resynced Google account scopes in database."
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  debug: process.env.NODE_ENV !== "production",
  session: {
    strategy: "jwt"
  },
  secret: env.nextAuthSecret,
  logger: {
    error(code, metadata) {
      logger.error({ code, metadata }, "NextAuth error");
    },
    warn(code) {
      logger.warn({ code }, "NextAuth warning");
    },
    debug(code, metadata) {
      logger.info({ code, metadata }, "NextAuth debug");
    }
  },
  providers: [
    GoogleProvider({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: {
        params: {
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
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        await persistGoogleAccountState({
          userId: user.id,
          account
        });

        logger.info(
          {
            event: "oauth_signin_jwt",
            userId: user.id,
            provider: account.provider,
            scope: account.scope,
            accessToken: previewToken(account.access_token),
            refreshTokenPresent: Boolean(account.refresh_token),
            expiresAt: account.expires_at
          },
          "Persisting Google OAuth tokens in JWT."
        );

        return {
          ...token,
          sub: user.id,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : undefined,
          refreshToken: account.refresh_token,
          googleScopes: account.scope,
          authError: undefined
        };
      }

      if (token.accessToken && token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      const refreshed = await refreshGoogleAccessToken({
        refreshToken: token.refreshToken,
        googleScopes: token.googleScopes
      });

      return {
        ...token,
        accessToken: refreshed.accessToken,
        accessTokenExpires: refreshed.accessTokenExpires,
        refreshToken: refreshed.refreshToken,
        googleScopes: refreshed.googleScopes,
        authError: refreshed.authError
      };
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      session.googleAccessToken = token.accessToken;
      session.googleScopes = token.googleScopes;
      session.authError = token.authError;

      logger.info(
        {
          event: "session_hydrated",
          userId: session.user?.id,
          googleScopes: token.googleScopes,
          hasGoogleAccessToken: Boolean(token.accessToken),
          authError: token.authError
        },
        "Hydrated NextAuth session."
      );

      return session;
    }
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id || account?.provider !== "google") {
        return;
      }

      const persistedAccount = await db.account.findFirst({
        where: {
          userId: user.id,
          provider: "google"
        },
        select: {
          scope: true,
          expires_at: true
        }
      });

      logger.info(
        {
          event: "oauth_account_persisted",
          userId: user.id,
          scopeFromCallback: account.scope,
          scopeInDatabase: persistedAccount?.scope,
          expiresAt: persistedAccount?.expires_at
        },
        "Google account persisted after OAuth sign-in."
      );
    }
  },
  pages: {
    signIn: "/login"
  }
};

export function auth() {
  return getServerSession(authOptions);
}
