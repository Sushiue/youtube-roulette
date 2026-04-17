export type RoomStatus = "LOBBY" | "IN_GAME" | "FINISHED" | "ABANDONED";
export type GameStatus = "WAITING" | "IN_PROGRESS" | "FINISHED" | "INTERRUPTED";
export type RoundStatus = "PENDING" | "ACTIVE" | "REVEALED" | "COMPLETED" | "SKIPPED";
export type VideoSourceType = "YOUTUBE_LIKES" | "YOUTUBE_PLAYLIST" | "YOUTUBE_CHANNEL" | "MANUAL";

export interface PublicPlayer {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  videoCount: number;
  score: number;
  correctAnswers: number;
}

export interface PublicVideoEntry {
  id: string;
  ownerPlayerId: string;
  ownerName: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
  videoUrl: string;
  embedUrl: string;
  sourceType: VideoSourceType;
}

export interface PublicRoundAnswer {
  playerId: string;
  guessedPlayerId: string;
  isCorrect: boolean;
  responseTimeMs: number | null;
  pointsAwarded: number;
}

export interface PublicRoundState {
  id: string;
  number: number;
  status: RoundStatus;
  startedAt: string | null;
  endsAt: string | null;
  revealedAt: string | null;
  revealEndsAt: string | null;
  video: PublicVideoEntry | null;
  sourcePlayerId: string | null;
  answers: PublicRoundAnswer[];
}

export interface PublicGameState {
  id: string;
  status: GameStatus;
  totalRounds: number;
  currentRoundNumber: number;
  startedAt: string | null;
  endedAt: string | null;
  rounds: PublicRoundState[];
}

export interface RoomSettings {
  totalRounds: number;
  roundDurationSeconds: number;
  youtubeImportLimit: number;
  fastestBonusEnabled: boolean;
}

export interface PublicRoomState {
  id: string;
  code: string;
  status: RoomStatus;
  hostUserId: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  videosReadyCount: number;
  game: PublicGameState | null;
}

export interface CreateRoomInput {
  displayName?: string;
}

export interface JoinRoomInput {
  code: string;
}

export interface ManualVideoInput {
  url: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
}

export interface RealtimeTokenPayload {
  sub: string;
  roomCode: string;
  roomPlayerId: string;
  name: string;
  image: string | null;
}

export interface RoundDeckCandidate {
  id: string;
  ownerPlayerId: string;
  youtubeVideoId: string;
}

export interface DeckSelection {
  videoId: string;
  ownerPlayerId: string;
}
