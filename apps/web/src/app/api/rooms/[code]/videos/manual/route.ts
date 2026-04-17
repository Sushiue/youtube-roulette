import { NextResponse } from "next/server";
import { VideoSourceType } from "@prisma/client";
import { manualVideoSchema } from "@youtube-roulette/shared";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyRealtimeRoomSync } from "@/lib/realtime-sync";
import { extractYouTubeVideoId, isYouTubeShortUrl } from "@/lib/youtube";

export async function POST(request: Request, context: { params: { code: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = manualVideoSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid video payload", issues: payload.error.flatten() }, { status: 400 });
  }

  const roomCode = context.params.code.toUpperCase();
  const roomPlayer = await db.roomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        code: roomCode
      }
    }
  });

  if (!roomPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isYouTubeShortUrl(payload.data.url)) {
    return NextResponse.json({ error: "YouTube Shorts are not allowed in the game pool." }, { status: 400 });
  }

  const youtubeVideoId = extractYouTubeVideoId(payload.data.url);
  if (!youtubeVideoId) {
    return NextResponse.json({ error: "Unable to extract YouTube video ID from the provided URL." }, { status: 400 });
  }

  const entry = await db.videoEntry.upsert({
    where: {
      roomId_youtubeVideoId: {
        roomId: roomPlayer.roomId,
        youtubeVideoId
      }
    },
    update: {
      ownerPlayerId: roomPlayer.id,
      title: payload.data.title,
      thumbnailUrl: payload.data.thumbnailUrl,
      channelTitle: payload.data.channelTitle,
      url: payload.data.url,
      embedUrl: `https://www.youtube.com/embed/${youtubeVideoId}`,
      sourceType: VideoSourceType.MANUAL,
      isActive: true
    },
    create: {
      roomId: roomPlayer.roomId,
      ownerPlayerId: roomPlayer.id,
      youtubeVideoId,
      title: payload.data.title,
      thumbnailUrl: payload.data.thumbnailUrl,
      channelTitle: payload.data.channelTitle,
      url: payload.data.url,
      embedUrl: `https://www.youtube.com/embed/${youtubeVideoId}`,
      sourceType: VideoSourceType.MANUAL
    }
  });

  logger.info({ roomCode, userId: session.user.id, youtubeVideoId }, "Manual fallback video added.");
  await notifyRealtimeRoomSync(roomCode);
  return NextResponse.json({ entry });
}
