export const APP_NAME = "YouTube Roulette";

export const DEFAULT_ROOM_SETTINGS = {
  totalRounds: 10,
  roundDurationSeconds: 30,
  youtubeImportLimit: 10,
  fastestBonusEnabled: true
} as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const MIN_VIDEOS_PER_PLAYER = 5;
export const MAX_ROOM_CODE_ATTEMPTS = 8;

export const SOCKET_EVENTS = {
  roomJoin: "room:join",
  roomLeave: "room:leave",
  roomPresence: "room:presence",
  roomReady: "room:ready",
  roomState: "room:state",
  gameStart: "game:start",
  answerSubmit: "answer:submit",
  roundTick: "round:tick",
  roundReveal: "round:reveal",
  nextRound: "round:next",
  gameComplete: "game:complete",
  hostTransfer: "room:host-transfer",
  error: "app:error"
} as const;
