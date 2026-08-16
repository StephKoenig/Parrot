import { describe, it, expect } from "vitest";
import { groupSeasons, formatMissingEpisodes, formatSeasonLabel, formatPanelHeader } from "../src/common/episode-panel";
import type { SeasonGapInfo } from "../src/common/types";

function makeSeason(
  num: number,
  owned: number,
  total: number,
  missingCount = 0,
  lastEpisode?: number,
): SeasonGapInfo {
  const missing = Array.from({ length: missingCount }, (_, i) => ({
    number: i + 1,
    name: `Episode ${i + 1}`,
  }));
  return { seasonNumber: num, ownedCount: owned, totalCount: total, missing, lastEpisode };
}

describe("groupSeasons", () => {
  it("groups contiguous complete seasons into a range", () => {
    const seasons = [
      makeSeason(1, 10, 10),
      makeSeason(2, 12, 12),
      makeSeason(3, 8, 8),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      type: "complete",
      startSeason: 1,
      endSeason: 3,
      ownedCount: 30,
      totalCount: 30,
      missingCount: 0,
      missingEpisodes: [],
    });
  });

  it("groups contiguous fully-missing seasons into a range", () => {
    const seasons = [
      makeSeason(1, 0, 10, 10),
      makeSeason(2, 0, 12, 12),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("missing");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(2);
    expect(groups[0].ownedCount).toBe(0);
    expect(groups[0].totalCount).toBe(22);
  });

  it("does not group partial seasons together", () => {
    const seasons = [
      makeSeason(1, 5, 10, 5),
      makeSeason(2, 3, 12, 9),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("partial");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[1].type).toBe("partial");
    expect(groups[1].startSeason).toBe(2);
  });

  it("handles mixed complete, partial, and missing seasons", () => {
    const seasons = [
      makeSeason(1, 10, 10),       // complete
      makeSeason(2, 12, 12),       // complete
      makeSeason(3, 5, 10, 5),     // partial
      makeSeason(4, 0, 8, 8),      // missing
      makeSeason(5, 0, 10, 10),    // missing
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(3);

    // S1 - S2: complete range
    expect(groups[0].type).toBe("complete");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(2);
    expect(groups[0].ownedCount).toBe(22);
    expect(groups[0].totalCount).toBe(22);

    // S3: partial (standalone)
    expect(groups[1].type).toBe("partial");
    expect(groups[1].startSeason).toBe(3);
    expect(groups[1].endSeason).toBe(3);
    expect(groups[1].missingCount).toBe(5);

    // S4 - S5: missing range
    expect(groups[2].type).toBe("missing");
    expect(groups[2].startSeason).toBe(4);
    expect(groups[2].endSeason).toBe(5);
    expect(groups[2].ownedCount).toBe(0);
    expect(groups[2].totalCount).toBe(18);
  });

  it("keeps a single season as non-range", () => {
    const seasons = [makeSeason(1, 10, 10)];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(1);
  });

  it("breaks group when a partial season interrupts", () => {
    const seasons = [
      makeSeason(1, 10, 10),       // complete
      makeSeason(2, 5, 10, 5),     // partial
      makeSeason(3, 8, 8),         // complete
      makeSeason(4, 12, 12),       // complete
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(3);

    expect(groups[0].type).toBe("complete");
    expect(groups[0].startSeason).toBe(1);
    expect(groups[0].endSeason).toBe(1);

    expect(groups[1].type).toBe("partial");
    expect(groups[1].startSeason).toBe(2);

    expect(groups[2].type).toBe("complete");
    expect(groups[2].startSeason).toBe(3);
    expect(groups[2].endSeason).toBe(4);
    expect(groups[2].ownedCount).toBe(20);
  });

  it("handles empty seasons array", () => {
    const groups = groupSeasons([]);
    expect(groups).toHaveLength(0);
  });

  it("carries the end season's lastEpisode onto merged groups", () => {
    const seasons = [
      makeSeason(1, 10, 10, 0, 10),
      makeSeason(2, 12, 12, 0, 12),
      makeSeason(3, 4, 4, 0, 4),
    ];
    const groups = groupSeasons(seasons);
    expect(groups).toHaveLength(1);
    expect(groups[0].lastEpisode).toBe(4);
  });

  it("leaves lastEpisode undefined when seasons lack it (stale cache shape)", () => {
    const groups = groupSeasons([makeSeason(1, 10, 10)]);
    expect(groups[0].lastEpisode).toBeUndefined();
  });

  it("populates missingEpisodes for partial seasons", () => {
    const seasons: SeasonGapInfo[] = [{
      seasonNumber: 1,
      ownedCount: 7,
      totalCount: 10,
      missing: [
        { number: 3, name: "Ep 3" },
        { number: 7, name: "Ep 7" },
        { number: 10, name: "Ep 10" },
      ],
    }];
    const groups = groupSeasons(seasons);
    expect(groups[0].missingEpisodes).toEqual([3, 7, 10]);
  });
});

describe("formatMissingEpisodes", () => {
  it("formats single episodes", () => {
    expect(formatMissingEpisodes([3, 7, 10])).toBe("e3, e7, e10");
  });

  it("formats consecutive episodes as range", () => {
    expect(formatMissingEpisodes([3, 4, 5])).toBe("e3-5");
  });

  it("formats mix of ranges and singles", () => {
    expect(formatMissingEpisodes([1, 2, 3, 5, 8, 9])).toBe("e1-3, e5, e8-9");
  });

  it("handles single episode", () => {
    expect(formatMissingEpisodes([4])).toBe("e4");
  });

  it("handles empty array", () => {
    expect(formatMissingEpisodes([])).toBe("");
  });

  it("handles two consecutive episodes", () => {
    expect(formatMissingEpisodes([6, 7])).toBe("e6-7");
  });

  it("sorts unsorted input", () => {
    expect(formatMissingEpisodes([10, 3, 7])).toBe("e3, e7, e10");
  });
});

describe("formatSeasonLabel", () => {
  it("appends the last episode code to a complete range", () => {
    const groups = groupSeasons([
      makeSeason(1, 7, 7, 0, 7),
      makeSeason(2, 6, 6, 0, 6),
      makeSeason(3, 4, 4, 0, 4),
    ]);
    expect(formatSeasonLabel(groups[0])).toBe("S1 - S3     17/17  (s03e04)");
  });

  it("appends the last episode code to a single complete season", () => {
    const groups = groupSeasons([makeSeason(2, 10, 10, 0, 10)]);
    expect(formatSeasonLabel(groups[0])).toBe("S2     10/10  (s02e10)");
  });

  it("omits the suffix when lastEpisode is unknown (stale cache shape)", () => {
    const groups = groupSeasons([makeSeason(1, 10, 10)]);
    expect(formatSeasonLabel(groups[0])).toBe("S1     10/10");
  });

  it("does not add the suffix to partial seasons", () => {
    const groups = groupSeasons([makeSeason(1, 7, 10, 3, 10)]);
    expect(formatSeasonLabel(groups[0])).toBe("S1     7/10  (e1-3)");
  });

  it("does not add the suffix to fully-missing seasons", () => {
    const groups = groupSeasons([makeSeason(1, 0, 10, 10, 10)]);
    expect(formatSeasonLabel(groups[0])).toBe("S1     0/10  (missing all)");
  });

  it("prints wide season/episode numbers without truncation", () => {
    const groups = groupSeasons([makeSeason(12, 105, 105, 0, 105)]);
    expect(formatSeasonLabel(groups[0])).toBe("S12     105/105  (s12e105)");
  });
});

describe("formatPanelHeader", () => {
  function makeGaps(seasons: SeasonGapInfo[]) {
    const totalOwned = seasons.reduce((n, s) => n + s.ownedCount, 0);
    const totalEpisodes = seasons.reduce((n, s) => n + s.totalCount, 0);
    return {
      showTitle: "The Copper Meridian",
      totalOwned,
      totalEpisodes,
      completeSeasons: seasons.filter((s) => s.missing.length === 0).length,
      totalSeasons: seasons.length,
      seasons,
    };
  }

  it("shows counts only — the last-episode code lives on the rows, not the header", () => {
    const gaps = makeGaps([
      makeSeason(1, 7, 7, 0, 7),
      makeSeason(2, 6, 6, 0, 6),
      makeSeason(3, 4, 4, 0, 4),
    ]);
    expect(formatPanelHeader(gaps)).toBe("17 of 17 episodes — 3 of 3 seasons full");
  });
});
