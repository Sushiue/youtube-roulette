import { RoomStatus } from "@prisma/client";
import { DEFAULT_ROOM_SETTINGS, MAX_ROOM_CODE_ATTEMPTS } from "@youtube-roulette/shared";
import { db } from "@/lib/db";

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function createUniqueRoomCode() {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    const existingRoom = await db.room.findUnique({
      where: {
        code
      },
      select: {
        id: true
      }
    });

    if (!existingRoom) {
      return code;
    }
  }

  throw new Error("Unable to generate a unique room code.");
}

export async function ensureRoomMembership(params: {
  roomCode: string;
  userId: string;
  displayName: string;
  image: string | null;
}) {
  const room = await db.room.findUnique({
    where: {
      code: params.roomCode
    }
  });

  if (!room) {
    throw new Error("This room does not exist.");
  }

  const membership = await db.roomPlayer.upsert({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: params.userId
      }
    },
    update: {
      displayNameSnapshot: params.displayName,
      avatarUrlSnapshot: params.image,
      isConnected: true,
      lastSeenAt: new Date(),
      disconnectedAt: null
    },
    create: {
      roomId: room.id,
      userId: params.userId,
      displayNameSnapshot: params.displayName,
      avatarUrlSnapshot: params.image,
      isConnected: true
    }
  });

  return {
    room,
    membership
  };
}

export async function createRoomForHost(params: {
  hostUserId: string;
  displayName: string;
  image: string | null;
}) {
  const code = await createUniqueRoomCode();

  const room = await db.room.create({
    data: {
      code,
      hostUserId: params.hostUserId,
      status: RoomStatus.LOBBY,
      settings: DEFAULT_ROOM_SETTINGS,
      players: {
        create: {
          userId: params.hostUserId,
          displayNameSnapshot: params.displayName,
          avatarUrlSnapshot: params.image,
          isConnected: true
        }
      }
    }
  });

  return room;
}

export async function transferHostIfNeeded(roomId: string) {
  const room = await db.room.findUnique({
    where: {
      id: roomId
    },
    include: {
      players: {
        where: {
          isConnected: true
        },
        orderBy: {
          joinedAt: "asc"
        }
      }
    }
  });

  if (!room) {
    return null;
  }

  const hostStillPresent = room.players.some((player) => player.userId === room.hostUserId);
  if (hostStillPresent) {
    return room.hostUserId;
  }

  const nextHost = room.players[0];
  if (!nextHost) {
    await db.room.update({
      where: {
        id: roomId
      },
      data: {
        status: RoomStatus.ABANDONED
      }
    });

    return null;
  }

  await db.room.update({
    where: {
      id: roomId
    },
    data: {
      hostUserId: nextHost.userId
    }
  });

  return nextHost.userId;
}
