import { fetchWithTimeout } from "../common/fetch-timeout";

export interface TvMazeExternals {
  tvdbId: number | null;
  imdbId: string | null;
}

const TVMAZE_BASE = "https://api.tvmaze.com";

function parseExternals(data: Record<string, unknown>): TvMazeExternals {
  return {
    tvdbId: (data.externals as Record<string, unknown>)?.thetvdb as number | null ?? null,
    imdbId: (data.externals as Record<string, unknown>)?.imdb as string | null ?? null,
  };
}

/** Get external IDs for a TVMaze show by its TVMaze numeric ID. */
export async function getTvMazeExternals(tvmazeId: string): Promise<TvMazeExternals> {
  // TVMaze sits directly in the CHECK hot path — a hung call here delays the
  // CHECK response itself (badge stuck invisible), hence the timeout.
  const res = await fetchWithTimeout(`${TVMAZE_BASE}/shows/${tvmazeId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TVMaze API error: ${res.status}`);
  return parseExternals((await res.json()) as Record<string, unknown>);
}

/** Look up a show by IMDb ID → returns TVDB ID (and IMDb ID back). */
export async function lookupByImdb(imdbId: string): Promise<TvMazeExternals | null> {
  const res = await fetchWithTimeout(`${TVMAZE_BASE}/lookup/shows?imdb=${encodeURIComponent(imdbId)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVMaze lookup error: ${res.status}`);
  return parseExternals((await res.json()) as Record<string, unknown>);
}

/** Look up a show by TVDB ID → returns IMDb ID (and TVDB ID back). */
export async function lookupByTvdb(tvdbId: string): Promise<TvMazeExternals | null> {
  const res = await fetchWithTimeout(`${TVMAZE_BASE}/lookup/shows?thetvdb=${encodeURIComponent(tvdbId)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVMaze lookup error: ${res.status}`);
  return parseExternals((await res.json()) as Record<string, unknown>);
}

// --- Episode list (keyless last-resort source for gap checking) ---

export interface TvMazeEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name?: string;
  /** "YYYY-MM-DD"; undefined when TVMaze has no air date. */
  airDate?: string;
}

export interface TvMazeShowEpisodes {
  title: string;
  episodes: TvMazeEpisode[];
}

interface RawShow {
  id?: number;
  name?: string;
}

interface RawEpisode {
  season?: number | null;
  /** null for specials — TVMaze has no season 0; those are dropped. */
  number?: number | null;
  name?: string | null;
  airdate?: string | null;
}

async function lookupShow(query: string): Promise<RawShow | null> {
  const res = await fetchWithTimeout(`${TVMAZE_BASE}/lookup/shows?${query}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVMaze lookup error: ${res.status}`);
  return (await res.json()) as RawShow;
}

/**
 * Resolve a show by TVDB or IMDb ID and fetch its regular episode list.
 * Keyless — used as the final fallback for episode gap checking when the
 * Sonarr proxy and user API keys are all unavailable. Specials are not
 * returned (TVMaze models them outside regular numbering, not as season 0).
 * Returns null when TVMaze doesn't know the show.
 */
export async function getTvMazeEpisodes(ids: {
  tvdbId?: number | string | null;
  imdbId?: string | null;
}): Promise<TvMazeShowEpisodes | null> {
  let show: RawShow | null = null;
  if (ids.tvdbId != null) {
    show = await lookupShow(`thetvdb=${encodeURIComponent(String(ids.tvdbId))}`);
  }
  if (!show?.id && ids.imdbId) {
    show = await lookupShow(`imdb=${encodeURIComponent(ids.imdbId)}`);
  }
  if (!show?.id) return null;

  const res = await fetchWithTimeout(`${TVMAZE_BASE}/shows/${show.id}/episodes`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TVMaze API error: ${res.status}`);
  const raw = (await res.json()) as RawEpisode[];

  const episodes: TvMazeEpisode[] = [];
  for (const ep of raw) {
    if (ep.season == null || ep.number == null) continue;
    episodes.push({
      seasonNumber: ep.season,
      episodeNumber: ep.number,
      name: ep.name ?? undefined,
      airDate: ep.airdate || undefined,
    });
  }
  return { title: show.name ?? "", episodes };
}
