import { z } from "zod";
import { DEFAULT_ROOM_SETTINGS, MAX_PLAYERS, MIN_PLAYERS } from "./constants.js";

export const createRoomSchema = z.object({
  displayName: z.string().trim().min(2).max(32).optional()
});

export const joinRoomSchema = z.object({
  code: z.string().trim().min(4).max(8).regex(/^[A-Z0-9]+$/)
});

export const manualVideoSchema = z.object({
  url: z.string().trim().url().refine((value) => value.includes("youtube.com/") || value.includes("youtu.be/"), {
    message: "Must be a valid YouTube URL."
  }),
  title: z.string().trim().min(1).max(120),
  thumbnailUrl: z.string().trim().url(),
  channelTitle: z.string().trim().min(1).max(120)
});

export const roomSettingsSchema = z.object({
  totalRounds: z.number().int().min(1).max(20).default(DEFAULT_ROOM_SETTINGS.totalRounds),
  roundDurationSeconds: z.number().int().min(30).max(30).default(DEFAULT_ROOM_SETTINGS.roundDurationSeconds),
  youtubeImportLimit: z.number().int().min(10).max(50).default(DEFAULT_ROOM_SETTINGS.youtubeImportLimit),
  fastestBonusEnabled: z.boolean().default(DEFAULT_ROOM_SETTINGS.fastestBonusEnabled)
});

export const hostLaunchSchema = z.object({
  roomCode: z.string().trim().min(4).max(8),
  playerCount: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS)
});
