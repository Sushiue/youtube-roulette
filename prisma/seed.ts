import { PrismaClient, RoomStatus, VideoSourceType } from "@prisma/client";
import { DEFAULT_ROOM_SETTINGS } from "../packages/shared/src/constants";

const prisma = new PrismaClient();

async function main() {
  const roomCode = "BDAY24";

  const [alice, bob, clara] = await Promise.all([
    prisma.user.upsert({
      where: { email: "alice.demo@example.com" },
      update: {},
      create: {
        email: "alice.demo@example.com",
        name: "Alice Demo",
        image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80"
      }
    }),
    prisma.user.upsert({
      where: { email: "bob.demo@example.com" },
      update: {},
      create: {
        email: "bob.demo@example.com",
        name: "Bob Demo",
        image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80"
      }
    }),
    prisma.user.upsert({
      where: { email: "clara.demo@example.com" },
      update: {},
      create: {
        email: "clara.demo@example.com",
        name: "Clara Demo",
        image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=256&q=80"
      }
    })
  ]);

  const room = await prisma.room.upsert({
    where: { code: roomCode },
    update: {
      status: RoomStatus.LOBBY,
      settings: DEFAULT_ROOM_SETTINGS,
      hostUserId: alice.id
    },
    create: {
      code: roomCode,
      hostUserId: alice.id,
      status: RoomStatus.LOBBY,
      settings: DEFAULT_ROOM_SETTINGS
    }
  });

  const players = await Promise.all([
    prisma.roomPlayer.upsert({
      where: { roomId_userId: { roomId: room.id, userId: alice.id } },
      update: { displayNameSnapshot: "Alice Demo", avatarUrlSnapshot: alice.image, isReady: true },
      create: {
        roomId: room.id,
        userId: alice.id,
        displayNameSnapshot: "Alice Demo",
        avatarUrlSnapshot: alice.image,
        isReady: true
      }
    }),
    prisma.roomPlayer.upsert({
      where: { roomId_userId: { roomId: room.id, userId: bob.id } },
      update: { displayNameSnapshot: "Bob Demo", avatarUrlSnapshot: bob.image, isReady: true },
      create: {
        roomId: room.id,
        userId: bob.id,
        displayNameSnapshot: "Bob Demo",
        avatarUrlSnapshot: bob.image,
        isReady: true
      }
    }),
    prisma.roomPlayer.upsert({
      where: { roomId_userId: { roomId: room.id, userId: clara.id } },
      update: { displayNameSnapshot: "Clara Demo", avatarUrlSnapshot: clara.image, isReady: false },
      create: {
        roomId: room.id,
        userId: clara.id,
        displayNameSnapshot: "Clara Demo",
        avatarUrlSnapshot: clara.image,
        isReady: false
      }
    })
  ]);

  const demoVideos = [
    {
      ownerPlayerId: players[0].id,
      youtubeVideoId: "dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      channelTitle: "Rick Astley",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      ownerPlayerId: players[1].id,
      youtubeVideoId: "9bZkp7q19f0",
      title: "PSY - GANGNAM STYLE",
      thumbnailUrl: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg",
      channelTitle: "officialpsy",
      url: "https://www.youtube.com/watch?v=9bZkp7q19f0",
      embedUrl: "https://www.youtube.com/embed/9bZkp7q19f0"
    },
    {
      ownerPlayerId: players[2].id,
      youtubeVideoId: "fJ9rUzIMcZQ",
      title: "Queen - Bohemian Rhapsody",
      thumbnailUrl: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
      channelTitle: "Queen Official",
      url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
      embedUrl: "https://www.youtube.com/embed/fJ9rUzIMcZQ"
    }
  ];

  for (const video of demoVideos) {
    await prisma.videoEntry.upsert({
      where: {
        roomId_youtubeVideoId: {
          roomId: room.id,
          youtubeVideoId: video.youtubeVideoId
        }
      },
      update: {
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        channelTitle: video.channelTitle,
        url: video.url,
        embedUrl: video.embedUrl,
        ownerPlayerId: video.ownerPlayerId,
        sourceType: VideoSourceType.MANUAL
      },
      create: {
        roomId: room.id,
        ownerPlayerId: video.ownerPlayerId,
        youtubeVideoId: video.youtubeVideoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        channelTitle: video.channelTitle,
        url: video.url,
        embedUrl: video.embedUrl,
        sourceType: VideoSourceType.MANUAL
      }
    });
  }

  console.log(`Seed complete. Demo room code: ${roomCode}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
