import type { EpisodeGapResponse, SeasonGapInfo } from "./types";
import { createPanelContainer, createPanelHeader, createPanelRow, createStatusIcon } from "./panel-utils";

const PANEL_ATTR = "data-parrot-episodes";

type GapData = NonNullable<EpisodeGapResponse["gaps"]>;

interface SeasonGroup {
  type: "complete" | "missing" | "partial";
  startSeason: number;
  endSeason: number;
  ownedCount: number;
  totalCount: number;
  missingCount: number;
  missingEpisodes: number[];
  /** Last counted episode of the group's end season; absent for stale cached gap data. */
  lastEpisode?: number;
}

/** Group contiguous complete or fully-missing seasons into ranges. */
export function groupSeasons(seasons: SeasonGapInfo[]): SeasonGroup[] {
  const groups: SeasonGroup[] = [];

  for (const season of seasons) {
    const isComplete = season.missing.length === 0;
    const isMissing = season.ownedCount === 0;
    const type = isComplete ? "complete" : isMissing ? "missing" : "partial";

    const last = groups[groups.length - 1];
    if (last && last.type === type && type !== "partial") {
      // Extend the existing group
      last.endSeason = season.seasonNumber;
      last.ownedCount += season.ownedCount;
      last.totalCount += season.totalCount;
      last.lastEpisode = season.lastEpisode;
    } else {
      groups.push({
        type,
        startSeason: season.seasonNumber,
        endSeason: season.seasonNumber,
        ownedCount: season.ownedCount,
        totalCount: season.totalCount,
        missingCount: season.missing.length,
        missingEpisodes: season.missing.map((m) => m.number),
        lastEpisode: season.lastEpisode,
      });
    }
  }

  return groups;
}

/** Format episode numbers into compact ranges: [1,2,3,5,8,9] → "e1-3, e5, e8-9" */
export function formatMissingEpisodes(episodes: number[]): string {
  if (episodes.length === 0) return "";
  const sorted = [...episodes].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `e${start}` : `e${start}-${end}`);
      start = sorted[i];
      end = start;
    }
  }
  ranges.push(start === end ? `e${start}` : `e${start}-${end}`);
  return ranges.join(", ");
}

/** Format an episode code like "s03e04" (2-digit zero-pad, wider numbers as-is). */
function formatEpisodeCode(season: number, episode: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `s${pad(season)}e${pad(episode)}`;
}

export function formatSeasonLabel(group: SeasonGroup): string {
  const range =
    group.startSeason === group.endSeason
      ? `S${group.startSeason}`
      : `S${group.startSeason} - S${group.endSeason}`;
  const count = `${group.ownedCount}/${group.totalCount}`;

  if (group.type === "complete") {
    // Show the last episode Parrot counted — tells the user how far its
    // knowledge extends when a site is ahead (new episode not yet in caches).
    const latest =
      group.lastEpisode != null ? `  (${formatEpisodeCode(group.endSeason, group.lastEpisode)})` : "";
    return `${range}     ${count}${latest}`;
  }
  if (group.type === "missing") {
    return `${range}     ${count}  (missing all)`;
  }
  // partial — show specific missing episodes
  return `${range}     ${count}  (${formatMissingEpisodes(group.missingEpisodes)})`;
}

export function formatPanelHeader(gaps: GapData): string {
  const base = `${gaps.totalOwned} of ${gaps.totalEpisodes} episodes \u2014 ${gaps.completeSeasons} of ${gaps.totalSeasons} seasons full`;
  let latest: { season: number; episode: number } | undefined;
  for (const season of gaps.seasons) {
    if (season.lastEpisode != null && (!latest || season.seasonNumber > latest.season)) {
      latest = { season: season.seasonNumber, episode: season.lastEpisode };
    }
  }
  return latest ? `${base} \u00b7 latest ${formatEpisodeCode(latest.season, latest.episode)}` : base;
}

export function createEpisodePanel(gaps: GapData, expanded = false): HTMLDivElement {
  const panel = createPanelContainer(PANEL_ATTR);

  const { header, body } = createPanelHeader(formatPanelHeader(gaps), expanded);

  const groups = groupSeasons(gaps.seasons);

  for (const group of groups) {
    const isComplete = group.type === "complete";
    const row = createPanelRow();
    row.appendChild(createStatusIcon(isComplete));

    const label = document.createElement("span");
    label.style.flex = "1";
    label.style.color = isComplete ? "#ddd" : "#777";
    label.textContent = formatSeasonLabel(group);

    row.appendChild(label);
    body.appendChild(row);
  }

  panel.appendChild(header);
  panel.appendChild(body);

  return panel;
}
