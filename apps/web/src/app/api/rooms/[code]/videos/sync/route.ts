import { NextResponse } from "next/server";
import { GameStatus, VideoSourceType } from "@prisma/client";
import { MIN_VIDEOS_PER_PLAYER } from "@youtube-roulette/shared";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyRealtimeRoomSync } from "@/lib/realtime-sync";
import { hasYouTubeReadonlyScope, importVideosFromYouTubeAccount, mergeScopes } from "@/lib/youtube";

const MAX_AUTOMATIC_IMPORT_VIDEOS = 60;

function buildImportMessage(params: {
  totalImported: number;
  minimumRequired: number;
  hasEnoughVideos: boolean;
  attempts: Array<{
    source: "likes" | "playlists" | "channel";
    status: "imported" | "empty" | "unavailable" | "error";
    importedCount: number;
  }>;
}) {
  const { totalImported, minimumRequired, hasEnoughVideos, attempts } = params;
  const likes = attempts.find((attempt) => attempt.source === "likes");
  const playlists = attempts.find((attempt) => attempt.source === "playlists");
  const channel = attempts.find((attempt) => attempt.source === "channel");

  if (totalImported === 0) {
    return `No usable videos were found from likes, playlists, or channel uploads. Add manual videos to reach ${minimumRequired}.`;
  }

  if ((likes?.importedCount ?? 0) > 0 && totalImported === (likes?.importedCount ?? 0)) {
    return hasEnoughVideos
      ? `Imported ${likes?.importedCount ?? 0} liked videos into your room catalog.`
      : `Imported ${likes?.importedCount ?? 0} liked videos into your room catalog, but you still need ${minimumRequired} total videos.`;
  }

  if ((likes?.importedCount ?? 0) === 0 && (playlists?.importedCount ?? 0) > 0 && (channel?.importedCount ?? 0) === 0) {
    return hasEnoughVideos
      ? `Liked videos unavailable, imported ${playlists?.importedCount ?? 0} playlist videos into your room catalog.`
      : `Liked videos unavailable, imported ${playlists?.importedCount ?? 0} playlist videos into your room catalog. Add manual videos to reach ${minimumRequired}.`;
  }

  if ((likes?.importedCount ?? 0) === 0 && (playlists?.importedCount ?? 0) === 0 && (channel?.importedCount ?? 0) > 0) {
    return hasEnoughVideos
      ? `Likes and playlists unavailable, imported ${channel?.importedCount ?? 0} channel videos into your room catalog.`
      : `Likes and playlists unavailable, imported ${channel?.importedCount ?? 0} channel videos into your room catalog. Add manual videos to reach ${minimumRequired}.`;
  }

  const parts = attempts
    .filter((attempt) => attempt.importedCount > 0)
    .map((attempt) => {
      const label = attempt.source === "channel" ? "channel" : attempt.source === "playlists" ? "playlist" : "liked";
      return `${attempt.importedCount} ${label} video${attempt.importedCount > 1 ? "s" : ""}`;
    });

  return hasEnoughVideos
    ? `Imported ${totalImported} videos into your room catalog from your YouTube account: ${parts.join(", ")}.`
    : `Imported ${totalImported} videos into your room catalog from your YouTube account: ${parts.join(", ")}. Add manual videos to reach ${minimumRequired}.`;
}

export async function POST(_: Request, context: { params: { code: string } }) {
  const session = await auth();
  if (!session?.user?.id || !session.googleAccessToken) {
    return NextResponse.json({ error: "You must be signed in with Google and grant YouTube access." }, { status: 401 });
  }

  if (session.authError) {
    return NextResponse.json({ error: "Google token refresh failed. Please sign in again." }, { status: 401 });
  }

  const googleAccount = await db.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "google"
    },
    select: {
      scope: true,
      expires_at: true
    }
  });

  const sessionScope = session.googleScopes ?? null;
  const persistedScope = googleAccount?.scope ?? null;
  const mergedScope = mergeScopes(sessionScope, persistedScope);
  const sessionHasScope = hasYouTubeReadonlyScope(sessionScope);
  const persistedHasScope = hasYouTubeReadonlyScope(persistedScope);
  const mergedHasScope = hasYouTubeReadonlyScope(mergedScope);

  logger.info(
    {
      event: "youtube_import_scope_check",
      userId: session.user.id,
      sessionScopes: sessionScope,
      persistedScopes: persistedScope,
      mergedScopes: mergedScope,
      sessionHasScope,
      persistedHasScope,
      mergedHasScope,
      hasAccessToken: Boolean(session.googleAccessToken),
      authError: session.authError,
      persistedExpiresAt: googleAccount?.expires_at
    },
    "Checking Google/YouTube scope state before import."
  );

  const roomCode = context.params.code.toUpperCase();
  const roomPlayer = await db.roomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        code: roomCode
      }
    },
    include: {
      room: true
    }
  });

  if (!roomPlayer) {
    return NextResponse.json({ error: "You are not part of this room." }, { status: 403 });
  }

  try {
    const existingImportedVideos = await db.videoEntry.findMany({
      where: {
        ownerPlayerId: roomPlayer.id,
        isActive: true,
        sourceType: {
          in: [VideoSourceType.YOUTUBE_CHANNEL, VideoSourceType.YOUTUBE_LIKES, VideoSourceType.YOUTUBE_PLAYLIST]
        }
      },
      select: {
        youtubeVideoId: true
      }
    });
    const recentGames = await db.game.findMany({
      where: {
        roomId: roomPlayer.roomId,
        status: {
          in: [GameStatus.FINISHED, GameStatus.INTERRUPTED]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5,
      include: {
        rounds: {
          where: {
            videoEntryId: {
              not: null
            }
          },
          select: {
            videoEntry: {
              select: {
                youtubeVideoId: true
              }
            }
          }
        }
      }
    });
    const importLimit = MAX_AUTOMATIC_IMPORT_VIDEOS;
    const recentYoutubeVideoIds = recentGames.flatMap((game) =>
      game.rounds
        .map((round) => round.videoEntry?.youtubeVideoId)
        .filter((youtubeVideoId): youtubeVideoId is string => Boolean(youtubeVideoId))
    );
    const { videos, hasEnoughVideos, attempts } = await importVideosFromYouTubeAccount(
      session.googleAccessToken,
      importLimit,
      {
        likesCursor: roomPlayer.youtubeLikesImportCursor,
        avoidYoutubeVideoIds: existingImportedVideos.map((video) => video.youtubeVideoId),
        recentYoutubeVideoIds
      }
    );
    const shouldAdvanceLikesCursor = ["imported", "empty"].includes(
      attempts.find((attempt) => attempt.source === "likes")?.status ?? ""
    );

    const syncedYoutubeVideoIds = videos.map((video) => video.youtubeVideoId);

    await db.$transaction(async (tx) => {
      if (shouldAdvanceLikesCursor) {
        await tx.roomPlayer.update({
          where: {
            id: roomPlayer.id
          },
          data: {
            youtubeLikesImportCursor: {
              increment: 1
            }
          }
        });
      }

      await tx.videoEntry.updateMany({
        where: {
          ownerPlayerId: roomPlayer.id,
          sourceType: {
            in: [VideoSourceType.YOUTUBE_CHANNEL, VideoSourceType.YOUTUBE_LIKES, VideoSourceType.YOUTUBE_PLAYLIST]
          },
          ...(syncedYoutubeVideoIds.length > 0
            ? {
                youtubeVideoId: {
                  notIn: syncedYoutubeVideoIds
                }
              }
            : {})
        },
        data: {
          isActive: false
        }
      });

      for (const video of videos) {
        await tx.videoEntry.upsert({
          where: {
            roomId_youtubeVideoId: {
              roomId: roomPlayer.roomId,
              youtubeVideoId: video.youtubeVideoId
            }
          },
          update: {
            ownerPlayerId: roomPlayer.id,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            channelTitle: video.channelTitle,
            url: video.url,
            embedUrl: video.embedUrl,
            sourceType: video.sourceType,
            isActive: true
          },
          create: {
            roomId: roomPlayer.roomId,
            ownerPlayerId: roomPlayer.id,
            youtubeVideoId: video.youtubeVideoId,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            channelTitle: video.channelTitle,
            url: video.url,
            embedUrl: video.embedUrl,
            sourceType: video.sourceType,
            isActive: true
          }
        });
      }
    });
    const storedActiveVideosCount = await db.videoEntry.count({
      where: {
        ownerPlayerId: roomPlayer.id,
        isActive: true
      }
    });

    logger.info(
      {
        roomCode,
        userId: session.user.id,
        importLimit,
        likesCursorUsed: roomPlayer.youtubeLikesImportCursor,
        existingImportedVideosCount: existingImportedVideos.length,
        recentYoutubeVideoIdsCount: recentYoutubeVideoIds.length,
        shouldAdvanceLikesCursor,
        importedCount: videos.length,
        storedActiveVideosCount,
        storedVideoIds: videos.map((video) => video.youtubeVideoId),
        attempts
      },
      "Imported videos from YouTube account sources."
    );

    await notifyRealtimeRoomSync(roomCode);

    return NextResponse.json({
      syncedCount: videos.length,
      hasEnoughVideos,
      minimumRequired: MIN_VIDEOS_PER_PLAYER,
      attempts,
      message: buildImportMessage({
        totalImported: videos.length,
        minimumRequired: MIN_VIDEOS_PER_PLAYER,
        hasEnoughVideos,
        attempts
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync YouTube account videos.";

    logger.warn(
      {
        error,
        roomCode,
        userId: session.user.id,
        sessionScopes: sessionScope,
        persistedScopes: persistedScope,
        mergedScopes: mergedScope
      },
      "Unable to sync YouTube account videos."
    );

    if (/insufficient authentication scopes/i.test(message)) {
      return NextResponse.json(
        {
          error: "The current Google access token was rejected by YouTube for insufficient scopes. Sign out and sign back in once, then retry."
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: message
      },
      { status: 400 }
    );
  }
}
