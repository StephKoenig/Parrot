import { describe, it, expect, vi, beforeEach } from "vitest";

let storage: typeof import("../src/common/storage");
let store: Record<string, unknown>;
let removeSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.restoreAllMocks();
  store = {
    libraryIndex: { items: [] },
    plexServers: [],
    "eg:tmdb:1399": { cacheKey: "tmdb:1399", resolution: "720p" },
    "eg:tvdb:81189": { cacheKey: "tvdb:81189", resolution: "1080p" },
    "cc:645": { data: {}, fetchedAt: 1 },
    "pc:radarr:550": { data: {}, fetchedAt: 1 },
  };
  removeSpy = vi.fn((keys: string[]) => {
    for (const k of keys) delete store[k];
    return Promise.resolve();
  });
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: vi.fn().mockImplementation(() => Promise.resolve(store)),
        set: vi.fn().mockResolvedValue(undefined),
        remove: removeSpy,
      },
    },
  });
  vi.resetModules();
  storage = await import("../src/common/storage");
});

describe("clearEpisodeGapCaches", () => {
  it("removes every eg:* entry", async () => {
    await storage.clearEpisodeGapCaches();
    expect(store["eg:tmdb:1399"]).toBeUndefined();
    expect(store["eg:tvdb:81189"]).toBeUndefined();
  });

  it("leaves collection, proxy and index data intact", async () => {
    await storage.clearEpisodeGapCaches();
    expect(store["cc:645"]).toBeDefined();
    expect(store["pc:radarr:550"]).toBeDefined();
    expect(store.libraryIndex).toBeDefined();
    expect(store.plexServers).toBeDefined();
  });

  it("also drops the pre-per-key legacy blob", async () => {
    store[storage.LEGACY_EPISODE_GAP_CACHE_KEY] = { old: true };
    await storage.clearEpisodeGapCaches();
    expect(store[storage.LEGACY_EPISODE_GAP_CACHE_KEY]).toBeUndefined();
  });

  it("is a no-op when there is nothing cached", async () => {
    store = {};
    await expect(storage.clearEpisodeGapCaches()).resolves.toBeUndefined();
  });
});

describe("clearMetadataCaches", () => {
  it("still clears episode gaps, collections and proxy entries together", async () => {
    await storage.clearMetadataCaches();
    expect(store["eg:tmdb:1399"]).toBeUndefined();
    expect(store["cc:645"]).toBeUndefined();
    expect(store["pc:radarr:550"]).toBeUndefined();
  });

  it("leaves the library index alone", async () => {
    await storage.clearMetadataCaches();
    expect(store.libraryIndex).toBeDefined();
  });
});
