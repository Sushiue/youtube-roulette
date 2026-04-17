import { VideoSourceType } from "@prisma/client";
import { MIN_VIDEOS_PER_PLAYER } from "@youtube-roulette/shared";
import { logger } from "@/lib/logger";

const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const MAX_SOURCE_FETCH_RESULTS = 50;
const MAX_LIKED_VIDEOS_PAGES = 12;
const MIN_LIKED_VIDEOS_PAGES_TO_EXPLORE = 8;

interface ImportVideosOptions {
  likesCursor?: number;
  avoidYoutubeVideoIds?: string[];
  recentYoutubeVideoIds?: string[];
}

export interface YouTubeImportedVideo {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
  url: string;
  embedUrl: string;
  sourceType: VideoSourceType;
}

export interface YouTubeImportAttempt {
  source: "likes" | "playlists" | "channel";
  status: "imported" | "empty" | "unavailable" | "error";
  importedCount: number;
  rawCount: number;
  note: string;
}

export interface YouTubeAccountImportResult {
  videos: YouTubeImportedVideo[];
  hasEnoughVideos: boolean;
  attempts: YouTubeImportAttempt[];
}

interface SampledPageSummary {
  pageNumber: number;
  normalizedCount: number;
  sampledCount: number;
}

class YouTubeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

interface YouTubeApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
  };
}

interface YouTubeChannelResponse extends YouTubeApiErrorResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YouTubePlaylistItemsResponse extends YouTubeApiErrorResponse {
  nextPageToken?: string;
  items?: Array<{
    contentDetails?: {
      videoId?: string;
    };
    snippet?: {
      title?: string;
      resourceId?: {
        videoId?: string;
      };
    };
  }>;
}

interface YouTubePlaylistsResponse extends YouTubeApiErrorResponse {
  nextPageToken?: string;
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
    contentDetails?: {
      itemCount?: number;
    };
  }>;
}

interface YouTubeVideosResponse extends YouTubeApiErrorResponse {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      thumbnails?: {
        high?: { url: string; width?: number; height?: number };
        medium?: { url: string; width?: number; height?: number };
        default?: { url: string; width?: number; height?: number };
      };
    };
    status?: {
      embeddable?: boolean;
      privacyStatus?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
}

interface PlaylistCandidate {
  id: string;
  title: string;
  itemCount: number;
}

function getOverfetchTarget(maxResults: number) {
  return Math.min(Math.max(maxResults * 3, maxResults), 250);
}

async function fetchYouTubeJson<T extends YouTubeApiErrorResponse>(accessToken: string, url: URL) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json()) as T;

  if (!response.ok || payload.error) {
    const message = payload.error?.message ?? "Unable to load YouTube data.";
    throw new YouTubeApiError(message, response.status || payload.error?.code || 500);
  }

  return payload;
}

function normalizeVideoItems(
  items: NonNullable<YouTubeVideosResponse["items"]>,
  sourceType: VideoSourceType,
  context: "likes" | "playlists" | "channel"
) {
  const filteredReasons = {
    missingId: 0,
    missingTitle: 0,
    private: 0,
    unembeddable: 0,
    shorts: 0
  };

  const videos: YouTubeImportedVideo[] = [];

  function parseIsoDurationToSeconds(duration?: string) {
    if (!duration) {
      return null;
    }

    const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (!match) {
      return null;
    }

    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2] ?? 0);
    const seconds = Number(match[3] ?? 0);

    return hours * 3600 + minutes * 60 + seconds;
  }

  function isLikelyYouTubeShort(item: NonNullable<YouTubeVideosResponse["items"]>[number]) {
    const durationSeconds = parseIsoDurationToSeconds(item.contentDetails?.duration);
    const title = item.snippet?.title?.toLowerCase() ?? "";
    const description = item.snippet?.description?.toLowerCase() ?? "";
    const thumbnails = Object.values(item.snippet?.thumbnails ?? {}).filter(
      (thumbnail): thumbnail is { url: string; width?: number; height?: number } => Boolean(thumbnail?.url)
    );

    const hasVerticalThumbnail = thumbnails.some(
      (thumbnail) =>
        typeof thumbnail.width === "number" &&
        typeof thumbnail.height === "number" &&
        thumbnail.height > thumbnail.width * 1.15
    );
    const hasSquareishThumbnail = thumbnails.some(
      (thumbnail) =>
        typeof thumbnail.width === "number" &&
        typeof thumbnail.height === "number" &&
        thumbnail.height >= thumbnail.width * 0.95
    );

    const mentionsShorts =
      /(^|\s)#shorts\b/.test(title) ||
      /(^|\s)#shorts\b/.test(description) ||
      /\bshorts?\b/.test(title) ||
      /\bshorts?\b/.test(description);

    if (durationSeconds !== null && durationSeconds <= 70) {
      return true;
    }

    if (mentionsShorts) {
      return true;
    }

    if (hasVerticalThumbnail && durationSeconds !== null && durationSeconds <= 240) {
      return true;
    }

    if (hasSquareishThumbnail && durationSeconds !== null && durationSeconds <= 180) {
      return true;
    }

    return false;
  }

  for (const item of items) {
    if (!item.id) {
      filteredReasons.missingId += 1;
      continue;
    }

    if (!item.snippet?.title) {
      filteredReasons.missingTitle += 1;
      continue;
    }

    if (item.status?.privacyStatus !== "public") {
      filteredReasons.private += 1;
      continue;
    }

    if (item.status?.embeddable === false) {
      filteredReasons.unembeddable += 1;
      continue;
    }

    if (isLikelyYouTubeShort(item)) {
      filteredReasons.shorts += 1;
      continue;
    }

    const thumbnailUrl =
      item.snippet.thumbnails?.high?.url ??
      item.snippet.thumbnails?.medium?.url ??
      item.snippet.thumbnails?.default?.url ??
      "";

    videos.push({
      youtubeVideoId: item.id,
      title: item.snippet.title,
      thumbnailUrl,
      channelTitle: item.snippet.channelTitle ?? "Unknown channel",
      url: `https://www.youtube.com/watch?v=${item.id}`,
      embedUrl: `https://www.youtube.com/embed/${item.id}`,
      sourceType
    });
  }

  logger.info(
    {
      context,
      totalFetched: items.length,
      importedCount: videos.length,
      filteredReasons
    },
    "Normalized YouTube videos for import."
  );

  return videos;
}

async function getVideoDetails(
  accessToken: string,
  videoIds: string[],
  sourceType: VideoSourceType,
  context: "likes" | "playlists" | "channel"
) {
  if (videoIds.length === 0) {
    return [];
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status,contentDetails");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("maxResults", String(Math.min(videoIds.length, MAX_SOURCE_FETCH_RESULTS)));

  const payload = await fetchYouTubeJson<YouTubeVideosResponse>(accessToken, url);
  const order = new Map(videoIds.map((videoId, index) => [videoId, index]));

  return normalizeVideoItems(payload.items ?? [], sourceType, context).sort(
    (left, right) => (order.get(left.youtubeVideoId) ?? 0) - (order.get(right.youtubeVideoId) ?? 0)
  );
}

function addUniqueVideos(target: YouTubeImportedVideo[], incoming: YouTubeImportedVideo[], maxResults: number) {
  const knownIds = new Set(target.map((video) => video.youtubeVideoId));
  let added = 0;

  for (const video of incoming) {
    if (target.length >= maxResults) {
      break;
    }

    if (knownIds.has(video.youtubeVideoId)) {
      continue;
    }

    target.push(video);
    knownIds.add(video.youtubeVideoId);
    added += 1;
  }

  return added;
}

function classifyAttemptError(error: unknown) {
  if (error instanceof YouTubeApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: "unavailable" as const,
        note: error.message
      };
    }

    return {
      status: "error" as const,
      note: error.message
    };
  }

  return {
    status: "error" as const,
    note: error instanceof Error ? error.message : "Unexpected YouTube import error."
  };
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function createRotatedIndexOrder(total: number, cursor: number) {
  if (total <= 0) {
    return [];
  }

  const safeOffset = ((cursor % total) + total) % total;
  return [...Array.from({ length: total - safeOffset }, (_, index) => safeOffset + index), ...Array.from({ length: safeOffset }, (_, index) => index)];
}

function sampleVideosAcrossPages(params: {
  pages: Array<{ pageNumber: number; videos: YouTubeImportedVideo[] }>;
  maxResults: number;
  likesCursor: number;
  avoidYoutubeVideoIds: string[];
  recentYoutubeVideoIds: string[];
}) {
  const { pages, maxResults, likesCursor, avoidYoutubeVideoIds, recentYoutubeVideoIds } = params;
  const avoidIds = new Set([...avoidYoutubeVideoIds, ...recentYoutubeVideoIds]);
  const pageOrder = createRotatedIndexOrder(pages.length, likesCursor);
  const pagePools = pages.map((page) => {
    const freshVideos = shuffle(page.videos.filter((video) => !avoidIds.has(video.youtubeVideoId)));
    const avoidedVideos = shuffle(page.videos.filter((video) => avoidIds.has(video.youtubeVideoId)));
    return {
      pageNumber: page.pageNumber,
      videos: [...freshVideos, ...avoidedVideos]
    };
  });

  const sampled: Array<YouTubeImportedVideo & { sampledFromPageNumber: number }> = [];
  const seenIds = new Set<string>();
  let addedInPass = true;

  while (sampled.length < maxResults && addedInPass) {
    addedInPass = false;

    for (const pageIndex of pageOrder) {
      const pool = pagePools[pageIndex];
      if (!pool) {
        continue;
      }

      while (pool.videos.length > 0) {
        const nextVideo = pool.videos.shift();
        if (!nextVideo || seenIds.has(nextVideo.youtubeVideoId)) {
          continue;
        }

        sampled.push({
          ...nextVideo,
          sampledFromPageNumber: pool.pageNumber
        });
        seenIds.add(nextVideo.youtubeVideoId);
        addedInPass = true;
        break;
      }

      if (sampled.length >= maxResults) {
        break;
      }
    }
  }

  const sampledPageSummary = pages.map<SampledPageSummary>((page) => ({
    pageNumber: page.pageNumber,
    normalizedCount: page.videos.length,
    sampledCount: sampled.filter((video) => video.sampledFromPageNumber === page.pageNumber).length
  }));

  return {
    sampledVideos: sampled.map(({ sampledFromPageNumber: _, ...video }) => video),
    sampledPageSummary
  };
}

async function fetchLikedVideosWithRotation(
  accessToken: string,
  maxResults: number,
  options: ImportVideosOptions
) {
  const pageSize = MAX_SOURCE_FETCH_RESULTS;
  const normalizedPages: Array<{ pageNumber: number; videos: YouTubeImportedVideo[] }> = [];
  let nextPageToken: string | undefined;
  let pagesFetched = 0;
  let rawCount = 0;
  const likesCursor = options.likesCursor ?? 0;

  while (pagesFetched < MAX_LIKED_VIDEOS_PAGES) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,status,contentDetails");
    url.searchParams.set("myRating", "like");
    url.searchParams.set("maxResults", String(pageSize));

    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const payload = await fetchYouTubeJson<YouTubeVideosResponse>(accessToken, url);
    const rawItems = payload.items ?? [];
    rawCount += rawItems.length;
    pagesFetched += 1;
    normalizedPages.push({
      pageNumber: pagesFetched,
      videos: normalizeVideoItems(rawItems, VideoSourceType.YOUTUBE_LIKES, "likes")
    });

    if (!payload.error && !(payload as { nextPageToken?: string }).nextPageToken) {
      break;
    }

    nextPageToken = (payload as { nextPageToken?: string }).nextPageToken;
    if (!nextPageToken) {
      break;
    }

    if (
      pagesFetched >= MIN_LIKED_VIDEOS_PAGES_TO_EXPLORE &&
      normalizedPages.reduce((total, page) => total + page.videos.length, 0) >= Math.max(maxResults * 2, 80)
    ) {
      break;
    }
  }

  const { sampledVideos, sampledPageSummary } = sampleVideosAcrossPages({
    pages: normalizedPages,
    maxResults,
    likesCursor,
    avoidYoutubeVideoIds: options.avoidYoutubeVideoIds ?? [],
    recentYoutubeVideoIds: options.recentYoutubeVideoIds ?? []
  });

  logger.info(
    {
      source: "likes",
      likesCursor,
      pagesFetched,
      rawCount,
      normalizedCount: normalizedPages.reduce((total, page) => total + page.videos.length, 0),
      sampledCount: sampledVideos.length,
      avoidYoutubeVideoIdsCount: options.avoidYoutubeVideoIds?.length ?? 0,
      recentYoutubeVideoIdsCount: options.recentYoutubeVideoIds?.length ?? 0,
      sampledPageSummary
    },
    "Fetched liked videos from YouTube."
  );

  return sampledVideos;
}

async function fetchOwnedPlaylists(accessToken: string, maxResults: number) {
  const playlists: PlaylistCandidate[] = [];
  let nextPageToken: string | undefined;

  while (playlists.length < Math.min(maxResults, 15)) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "25");

    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const payload = await fetchYouTubeJson<YouTubePlaylistsResponse>(accessToken, url);

    for (const item of payload.items ?? []) {
      if (!item.id) {
        continue;
      }

      const title = item.snippet?.title ?? "Untitled playlist";
      const itemCount = item.contentDetails?.itemCount ?? 0;

      if (itemCount <= 0) {
        continue;
      }

      playlists.push({
        id: item.id,
        title,
        itemCount
      });
    }

    if (!payload.nextPageToken) {
      break;
    }

    nextPageToken = payload.nextPageToken;
  }

  logger.info(
    {
      source: "playlists",
      playlistCount: playlists.length,
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        title: playlist.title,
        itemCount: playlist.itemCount
      }))
    },
    "Fetched owned YouTube playlists."
  );

  return playlists;
}

async function fetchPlaylistVideos(accessToken: string, maxResults: number) {
  const targetVideoCount = getOverfetchTarget(maxResults);
  const playlists = await fetchOwnedPlaylists(accessToken, maxResults);
  const videoIds = new Set<string>();

  for (const playlist of playlists) {
    if (videoIds.size >= targetVideoCount) {
      break;
    }

    let nextPageToken: string | undefined;

    while (videoIds.size < targetVideoCount) {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("playlistId", playlist.id);
      url.searchParams.set("maxResults", "50");

      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken);
      }

      const payload = await fetchYouTubeJson<YouTubePlaylistItemsResponse>(accessToken, url);

      for (const item of payload.items ?? []) {
        const title = item.snippet?.title?.toLowerCase();
        const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;

        if (!videoId) {
          continue;
        }

        if (title === "private video" || title === "deleted video") {
          continue;
        }

        videoIds.add(videoId);
      }

      if (!payload.nextPageToken) {
        break;
      }

      nextPageToken = payload.nextPageToken;
    }
  }

  const videos = await getVideoDetails(
    accessToken,
    [...videoIds].slice(0, targetVideoCount),
    VideoSourceType.YOUTUBE_PLAYLIST,
    "playlists"
  );

  logger.info(
    {
      source: "playlists",
      playlistCount: playlists.length,
      rawVideoCount: videoIds.size,
      importedCount: videos.length
    },
    "Fetched YouTube playlist videos."
  );

  return {
    playlists,
    videos: videos.slice(0, maxResults)
  };
}

async function getAuthenticatedChannel(accessToken: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "1");

  const payload = await fetchYouTubeJson<YouTubeChannelResponse>(accessToken, url);
  const channel = payload.items?.[0];

  if (!channel?.id || !channel.contentDetails?.relatedPlaylists?.uploads) {
    return null;
  }

  return {
    id: channel.id,
    title: channel.snippet?.title ?? "Your YouTube channel",
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads
  };
}

async function getRecentUploadVideoIds(accessToken: string, uploadsPlaylistId: string, maxResults: number) {
  const ids = new Set<string>();
  const fetchTarget = getOverfetchTarget(maxResults);
  let nextPageToken: string | undefined;

  while (ids.size < fetchTarget) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", String(Math.min(50, fetchTarget - ids.size)));

    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const payload = await fetchYouTubeJson<YouTubePlaylistItemsResponse>(accessToken, url);

    for (const item of payload.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title?.toLowerCase();

      if (!videoId) {
        continue;
      }

      if (title === "private video" || title === "deleted video") {
        continue;
      }

      ids.add(videoId);
    }

    if (!payload.nextPageToken) {
      break;
    }

    nextPageToken = payload.nextPageToken;
  }

  return [...ids];
}

async function fetchRecentChannelVideos(accessToken: string, maxResults: number) {
  const channel = await getAuthenticatedChannel(accessToken);

  if (!channel) {
    return {
      channelTitle: null,
      videos: [] as YouTubeImportedVideo[],
      note: "No YouTube channel with accessible uploads was found for this account."
    };
  }

  const recentVideoIds = await getRecentUploadVideoIds(accessToken, channel.uploadsPlaylistId, maxResults);
  const videos = await getVideoDetails(accessToken, recentVideoIds, VideoSourceType.YOUTUBE_CHANNEL, "channel");

  logger.info(
    {
      source: "channel",
      channelTitle: channel.title,
      rawVideoCount: recentVideoIds.length,
      importedCount: videos.length
    },
    "Fetched recent YouTube channel uploads."
  );

  return {
    channelTitle: channel.title,
    videos: videos.slice(0, maxResults),
    note:
      recentVideoIds.length === 0
        ? "No recent channel uploads were found for this account."
        : videos.length === 0
          ? "Channel uploads were found, but none of the recent videos are public and embeddable."
          : undefined
  };
}

export async function importVideosFromYouTubeAccount(
  accessToken: string,
  maxResults: number,
  options: ImportVideosOptions = {}
): Promise<YouTubeAccountImportResult> {
  const collected: YouTubeImportedVideo[] = [];
  const attempts: YouTubeImportAttempt[] = [];

  try {
    const likedVideos = await fetchLikedVideosWithRotation(accessToken, maxResults, options);
    const importedCount = addUniqueVideos(collected, likedVideos, maxResults);
    attempts.push({
      source: "likes",
      status: importedCount > 0 ? "imported" : "empty",
      importedCount,
      rawCount: likedVideos.length,
      note: importedCount > 0 ? "Imported liked videos from the YouTube account." : "No usable liked videos were returned."
    });
  } catch (error) {
    const outcome = classifyAttemptError(error);
    logger.warn(
      {
        source: "likes",
        outcome
      },
      "Liked videos import attempt did not produce usable videos."
    );
    attempts.push({
      source: "likes",
      status: outcome.status,
      importedCount: 0,
      rawCount: 0,
      note: outcome.note
    });
  }

  if (collected.length < maxResults) {
    try {
      const { playlists, videos } = await fetchPlaylistVideos(accessToken, maxResults - collected.length);
      const importedCount = addUniqueVideos(collected, videos, maxResults);
      attempts.push({
        source: "playlists",
        status: importedCount > 0 ? "imported" : "empty",
        importedCount,
        rawCount: videos.length,
        note:
          playlists.length > 0
            ? importedCount > 0
              ? `Imported videos from ${playlists.length} owned playlists.`
              : `Found ${playlists.length} playlists, but none yielded usable public embeddable videos.`
            : "No owned playlists were returned for this account."
      });
    } catch (error) {
      const outcome = classifyAttemptError(error);
      logger.warn(
        {
          source: "playlists",
          outcome
        },
        "Playlist import attempt did not produce usable videos."
      );
      attempts.push({
        source: "playlists",
        status: outcome.status,
        importedCount: 0,
        rawCount: 0,
        note: outcome.note
      });
    }
  }

  if (collected.length < maxResults) {
    try {
      const { videos, channelTitle, note } = await fetchRecentChannelVideos(accessToken, maxResults - collected.length);
      const importedCount = addUniqueVideos(collected, videos, maxResults);
      attempts.push({
        source: "channel",
        status: importedCount > 0 ? "imported" : "empty",
        importedCount,
        rawCount: videos.length,
        note:
          importedCount > 0
            ? `Imported recent uploads${channelTitle ? ` from ${channelTitle}` : ""}.`
            : (note ?? "No usable channel uploads were found.")
      });
    } catch (error) {
      const outcome = classifyAttemptError(error);
      logger.warn(
        {
          source: "channel",
          outcome
        },
        "Channel import attempt did not produce usable videos."
      );
      attempts.push({
        source: "channel",
        status: outcome.status,
        importedCount: 0,
        rawCount: 0,
        note: outcome.note
      });
    }
  }

  logger.info(
    {
      totalImported: collected.length,
      maxResults,
      attempts
    },
    "Completed multi-source YouTube account import."
  );

  return {
    videos: collected,
    hasEnoughVideos: collected.length >= MIN_VIDEOS_PER_PLAYER,
    attempts
  };
}

export function hasYouTubeReadonlyScope(scope?: string | null) {
  if (!scope) {
    return false;
  }

  return scope
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(YOUTUBE_READONLY_SCOPE);
}

export function mergeScopes(...scopeValues: Array<string | null | undefined>) {
  const scopes = new Set<string>();

  for (const scopeValue of scopeValues) {
    if (!scopeValue) {
      continue;
    }

    for (const scope of scopeValue.split(/[\s,]+/)) {
      const trimmed = scope.trim();
      if (trimmed) {
        scopes.add(trimmed);
      }
    }
  }

  return [...scopes].join(" ");
}

export function extractYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }

    return null;
  } catch {
    return null;
  }
}

export function isYouTubeShortUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes("/shorts/");
  } catch {
    return false;
  }
}
