import { DEFAULT_ROOM_SETTINGS, MIN_PLAYERS, MIN_VIDEOS_PER_PLAYER } from "./constants.js";
import type { DeckSelection, RoundDeckCandidate, RoomSettings } from "./types.js";

interface BuildDeckOptions {
  recentYoutubeVideoIds?: string[];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function sortPoolWithCooldown(pool: RoundDeckCandidate[], recentYoutubeVideoIds: string[]) {
  if (recentYoutubeVideoIds.length === 0) {
    return shuffle(pool);
  }

  const recentRank = new Map(recentYoutubeVideoIds.map((videoId, index) => [videoId, index]));
  const fresh = shuffle(pool.filter((video) => !recentRank.has(video.youtubeVideoId)));
  const cooledDown = [...pool.filter((video) => recentRank.has(video.youtubeVideoId))]
    .sort(
      (left, right) =>
        (recentRank.get(left.youtubeVideoId) ?? Number.MAX_SAFE_INTEGER) -
        (recentRank.get(right.youtubeVideoId) ?? Number.MAX_SAFE_INTEGER)
    );

  return [...fresh, ...cooledDown];
}

export function buildDeck(
  candidates: RoundDeckCandidate[],
  settings: RoomSettings = DEFAULT_ROOM_SETTINGS,
  options: BuildDeckOptions = {}
): DeckSelection[] {
  const maxRounds = settings.totalRounds;
  if (candidates.length < maxRounds) {
    throw new Error(`At least ${maxRounds} unique videos are required to build the game deck.`);
  }

  const byOwner = new Map<string, RoundDeckCandidate[]>();

  for (const candidate of candidates) {
    const group = byOwner.get(candidate.ownerPlayerId) ?? [];
    group.push(candidate);
    byOwner.set(candidate.ownerPlayerId, group);
  }

  const owners = shuffle(Array.from(byOwner.keys()));
  if (owners.length < MIN_PLAYERS) {
    throw new Error("At least two players with videos are required.");
  }

  const recentYoutubeVideoIds = options.recentYoutubeVideoIds ?? [];
  for (const owner of owners) {
    byOwner.set(owner, sortPoolWithCooldown(byOwner.get(owner) ?? [], recentYoutubeVideoIds));
  }

  const ownerUsage = new Map<string, number>(owners.map((owner) => [owner, 0]));
  const deck: DeckSelection[] = [];
  const usedVideoIds = new Set<string>();

  while (deck.length < maxRounds) {
    const eligibleOwners = owners.filter((owner) => (byOwner.get(owner) ?? []).some((video) => !usedVideoIds.has(video.id)));

    if (eligibleOwners.length === 0) {
      break;
    }

    const minimumUsage = Math.min(...eligibleOwners.map((owner) => ownerUsage.get(owner) ?? 0));
    const leastUsedOwners = shuffle(
      eligibleOwners.filter((owner) => (ownerUsage.get(owner) ?? 0) === minimumUsage)
    );
    const owner = leastUsedOwners[0];
    const pool = (byOwner.get(owner) ?? []).filter((video) => !usedVideoIds.has(video.id));
    if (pool.length === 0) {
      continue;
    }

    const [selected] = pool;
    deck.push({
      videoId: selected.id,
      ownerPlayerId: selected.ownerPlayerId
    });
    usedVideoIds.add(selected.id);
    ownerUsage.set(owner, (ownerUsage.get(owner) ?? 0) + 1);
  }

  if (deck.length < maxRounds) {
    throw new Error("Not enough unique videos to build the full game deck.");
  }

  return deck;
}

export function validateRoomCanStart(playerCount: number, readyCount: number, videoOwnersCount: number, settings: RoomSettings) {
  if (playerCount < MIN_PLAYERS) {
    throw new Error("At least two players are required to start the game.");
  }

  if (readyCount < playerCount) {
    throw new Error("All players must be ready before the host can start.");
  }

  if (videoOwnersCount < MIN_PLAYERS) {
    throw new Error("At least two players must have valid videos.");
  }

  if (settings.totalRounds < 1) {
    throw new Error("The room must have at least one round.");
  }
}

export function getRoundDeadline(startedAt: Date, settings: RoomSettings) {
  return new Date(startedAt.getTime() + DEFAULT_ROOM_SETTINGS.roundDurationSeconds * 1000);
}

export function calculateAnswerScore(params: {
  isCorrect: boolean;
  isFastestCorrect: boolean;
  fastestBonusEnabled: boolean;
}) {
  if (!params.isCorrect) {
    return 0;
  }

  return 1 + (params.fastestBonusEnabled && params.isFastestCorrect ? 1 : 0);
}

export function hasEnoughVideos(videoCount: number) {
  return videoCount >= MIN_VIDEOS_PER_PLAYER;
}
