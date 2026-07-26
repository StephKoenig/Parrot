/**
 * Server-URL self-heal: when an index refresh fails on every configured URL
 * (e.g. the server rebooted onto a new DHCP address), ask plex.tv for the
 * server's CURRENT connection URLs and update the stored config. The Plex
 * server re-publishes its addresses to plex.tv on startup, so this recovers
 * both the local URL (new LAN IP) and the .plex.direct remote URL.
 *
 * Only ever invoked from the refresh *failure* path — a healthy local
 * connection never touches plex.tv.
 */

import { fetchServerConnections, pickLocalUrl, pickRemoteUrl, type PlexResource } from "../../api/plex-tv";
import { debugLog } from "../../common/logger";
import type { PlexServerConfig } from "../../common/types";

/**
 * Apply freshly discovered connection URLs to the server configs.
 * Pure: returns the updated list and whether anything actually changed.
 * A server missing from the resources (offline / other account) or a
 * connection type plex.tv didn't report keeps its existing value.
 */
export function healServerConfigs(
  servers: PlexServerConfig[],
  resources: PlexResource[],
): { servers: PlexServerConfig[]; changed: boolean } {
  let changed = false;
  const healed = servers.map((server) => {
    const localUrl = pickLocalUrl(resources, server.id) ?? server.serverUrl;
    const remoteUrl = pickRemoteUrl(resources, server.id) ?? server.remoteUrl;
    if (localUrl === server.serverUrl && remoteUrl === server.remoteUrl) return server;
    changed = true;
    debugLog("BG",
      `self-heal: ${server.name} URLs updated — local ${server.serverUrl} → ${localUrl}, remote ${server.remoteUrl ?? "none"} → ${remoteUrl ?? "none"}`);
    return { ...server, serverUrl: localUrl, remoteUrl };
  });
  return { servers: healed, changed };
}

/**
 * Re-discover connection URLs for all configured servers via plex.tv.
 * Returns the healed config list, or null when discovery was unavailable
 * or nothing changed (callers then surface the original failure).
 */
export async function tryHealServerUrls(
  servers: PlexServerConfig[],
): Promise<PlexServerConfig[] | null> {
  // One resources call per unique token (multi-server setups usually share one)
  const tokens = [...new Set(servers.map((s) => s.token))];
  const resources: PlexResource[] = [];
  for (const token of tokens) {
    resources.push(...await fetchServerConnections(token));
  }
  if (resources.length === 0) {
    debugLog("BG", "self-heal: plex.tv discovery unavailable, keeping existing URLs");
    return null;
  }

  const { servers: healed, changed } = healServerConfigs(servers, resources);
  return changed ? healed : null;
}
