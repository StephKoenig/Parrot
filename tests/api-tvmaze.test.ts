import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTvMazeExternals, getTvMazeEpisodes, lookupByImdb, lookupByTvdb } from "../src/api/tvmaze";

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  }));
}

describe("getTvMazeExternals", () => {
  it("returns TVDB and IMDb IDs from externals", async () => {
    mockFetch({ externals: { thetvdb: 12345, imdb: "tt0000001" } });
    const result = await getTvMazeExternals("100");
    expect(result).toEqual({ tvdbId: 12345, imdbId: "tt0000001" });
  });

  it("returns nulls when externals are missing", async () => {
    mockFetch({ externals: { thetvdb: null, imdb: null } });
    const result = await getTvMazeExternals("100");
    expect(result).toEqual({ tvdbId: null, imdbId: null });
  });

  it("calls correct URL", async () => {
    mockFetch({ externals: {} });
    await getTvMazeExternals("42");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.tvmaze.com/shows/42",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch({}, 500);
    await expect(getTvMazeExternals("100")).rejects.toThrow("TVMaze API error: 500");
  });
});

describe("lookupByImdb", () => {
  it("returns externals when show found", async () => {
    mockFetch({ externals: { thetvdb: 999, imdb: "tt0000002" } });
    const result = await lookupByImdb("tt0000002");
    expect(result).toEqual({ tvdbId: 999, imdbId: "tt0000002" });
  });

  it("returns null on 404", async () => {
    mockFetch({}, 404);
    const result = await lookupByImdb("tt9999999");
    expect(result).toBeNull();
  });

  it("throws on other errors", async () => {
    mockFetch({}, 500);
    await expect(lookupByImdb("tt0000001")).rejects.toThrow("TVMaze lookup error: 500");
  });

  it("encodes IMDb ID in URL", async () => {
    mockFetch({ externals: {} });
    await lookupByImdb("tt0000001");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("imdb=tt0000001"),
      expect.anything(),
    );
  });
});

describe("getTvMazeEpisodes", () => {
  const SHOW = { id: 77, name: "Harbor of Glass", externals: { thetvdb: 12345, imdb: "tt0000004" } };
  const EPISODES = [
    { season: 1, number: 1, name: "The Copper Meridian", airdate: "2020-01-01" },
    { season: 1, number: 2, name: "Lanterns at Dusk", airdate: "" },
    { season: 2, number: null, name: "Reunion Special", airdate: "2021-06-01" },
    { season: 2, number: 1, name: "Salt and Circuit", airdate: "2021-09-01" },
  ];

  function mockFetchSequence(...responses: { data?: unknown; status?: number }[]) {
    const fn = vi.fn();
    for (const r of responses) {
      const status = r.status ?? 200;
      fn.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(r.data ?? {}),
      });
    }
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("resolves by TVDB ID and returns title plus normalized episodes", async () => {
    mockFetchSequence({ data: SHOW }, { data: EPISODES });
    const result = await getTvMazeEpisodes({ tvdbId: 12345 });
    expect(result).toEqual({
      title: "Harbor of Glass",
      episodes: [
        { seasonNumber: 1, episodeNumber: 1, name: "The Copper Meridian", airDate: "2020-01-01" },
        { seasonNumber: 1, episodeNumber: 2, name: "Lanterns at Dusk", airDate: undefined },
        { seasonNumber: 2, episodeNumber: 1, name: "Salt and Circuit", airDate: "2021-09-01" },
      ],
    });
  });

  it("fetches the episode list for the resolved TVMaze show ID", async () => {
    const fn = mockFetchSequence({ data: SHOW }, { data: EPISODES });
    await getTvMazeEpisodes({ tvdbId: 12345 });
    expect(fn).toHaveBeenNthCalledWith(1, expect.stringContaining("thetvdb=12345"), expect.anything());
    expect(fn).toHaveBeenNthCalledWith(2, "https://api.tvmaze.com/shows/77/episodes", expect.anything());
  });

  it("falls back to IMDb lookup when the TVDB lookup 404s", async () => {
    const fn = mockFetchSequence({ status: 404 }, { data: SHOW }, { data: EPISODES });
    const result = await getTvMazeEpisodes({ tvdbId: 12345, imdbId: "tt0000004" });
    expect(fn).toHaveBeenNthCalledWith(2, expect.stringContaining("imdb=tt0000004"), expect.anything());
    expect(result?.title).toBe("Harbor of Glass");
  });

  it("uses IMDb lookup directly when no TVDB ID is given", async () => {
    const fn = mockFetchSequence({ data: SHOW }, { data: EPISODES });
    await getTvMazeEpisodes({ imdbId: "tt0000004" });
    expect(fn).toHaveBeenNthCalledWith(1, expect.stringContaining("imdb=tt0000004"), expect.anything());
  });

  it("returns null when no lookup resolves", async () => {
    mockFetchSequence({ status: 404 }, { status: 404 });
    const result = await getTvMazeEpisodes({ tvdbId: 1, imdbId: "tt0" });
    expect(result).toBeNull();
  });

  it("returns null when no IDs are provided", async () => {
    const fn = mockFetchSequence();
    const result = await getTvMazeEpisodes({});
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws when the episode fetch fails", async () => {
    mockFetchSequence({ data: SHOW }, { status: 500 });
    await expect(getTvMazeEpisodes({ tvdbId: 12345 })).rejects.toThrow("TVMaze API error: 500");
  });
});

describe("lookupByTvdb", () => {
  it("returns externals when show found", async () => {
    mockFetch({ externals: { thetvdb: 12345, imdb: "tt0000003" } });
    const result = await lookupByTvdb("12345");
    expect(result).toEqual({ tvdbId: 12345, imdbId: "tt0000003" });
  });

  it("returns null on 404", async () => {
    mockFetch({}, 404);
    const result = await lookupByTvdb("99999");
    expect(result).toBeNull();
  });

  it("uses thetvdb query param", async () => {
    mockFetch({ externals: {} });
    await lookupByTvdb("12345");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("thetvdb=12345"),
      expect.anything(),
    );
  });
});
