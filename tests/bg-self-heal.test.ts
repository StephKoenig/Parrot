import { describe, it, expect, vi, beforeEach } from "vitest";
import { healServerConfigs, tryHealServerUrls } from "../src/entrypoints/bg/self-heal";
import { fetchServerConnections, type PlexResource } from "../src/api/plex-tv";
import type { PlexServerConfig } from "../src/common/types";

vi.mock("../src/api/plex-tv", async (importOriginal) => {
  // Keep the real pickLocalUrl/pickRemoteUrl — only discovery is mocked
  const actual = await importOriginal<typeof import("../src/api/plex-tv")>();
  return { ...actual, fetchServerConnections: vi.fn() };
});

const server: PlexServerConfig = {
  id: "machine-1",
  name: "Holodeck",
  serverUrl: "http://192.168.1.100:32400",
  remoteUrl: "https://1-2-3-4.abc.plex.direct:32400",
  token: "tok-1",
};

function resource(
  clientIdentifier: string,
  localUri: string | null,
  remoteUri: string | null,
): PlexResource {
  const connections = [];
  if (localUri) connections.push({ protocol: "https", address: "x", port: 32400, uri: localUri, local: true, relay: false });
  if (remoteUri) connections.push({ protocol: "https", address: "y", port: 32400, uri: remoteUri, local: false, relay: false });
  return { clientIdentifier, name: "Holodeck", owned: true, provides: "server", connections };
}

beforeEach(() => {
  vi.mocked(fetchServerConnections).mockReset();
});

describe("healServerConfigs", () => {
  it("updates local and remote URLs from the discovered connections", () => {
    const resources = [resource("machine-1", "http://192.168.1.42:32400", "https://5-6-7-8.abc.plex.direct:32400")];
    const { servers, changed } = healServerConfigs([server], resources);

    expect(changed).toBe(true);
    expect(servers[0].serverUrl).toBe("http://192.168.1.42:32400");
    expect(servers[0].remoteUrl).toBe("https://5-6-7-8.abc.plex.direct:32400");
    expect(servers[0].name).toBe("Holodeck"); // everything else preserved
    expect(servers[0].token).toBe("tok-1");
  });

  it("keeps existing values when a connection type is missing from discovery", () => {
    const resources = [resource("machine-1", "http://192.168.1.42:32400", null)];
    const { servers } = healServerConfigs([server], resources);

    expect(servers[0].serverUrl).toBe("http://192.168.1.42:32400");
    expect(servers[0].remoteUrl).toBe(server.remoteUrl);
  });

  it("leaves servers untouched (changed=false) when nothing differs", () => {
    const resources = [resource("machine-1", server.serverUrl, server.remoteUrl!)];
    const { servers, changed } = healServerConfigs([server], resources);

    expect(changed).toBe(false);
    expect(servers[0]).toBe(server);
  });

  it("leaves a server untouched when it is absent from the resources", () => {
    const resources = [resource("other-machine", "http://10.0.0.5:32400", null)];
    const { servers, changed } = healServerConfigs([server], resources);

    expect(changed).toBe(false);
    expect(servers[0]).toBe(server);
  });
});

describe("tryHealServerUrls", () => {
  it("returns healed configs when plex.tv reports new URLs", async () => {
    vi.mocked(fetchServerConnections).mockResolvedValue([
      resource("machine-1", "http://192.168.1.42:32400", "https://5-6-7-8.abc.plex.direct:32400"),
    ]);

    const healed = await tryHealServerUrls([server]);
    expect(healed?.[0].serverUrl).toBe("http://192.168.1.42:32400");
    expect(fetchServerConnections).toHaveBeenCalledWith("tok-1");
  });

  it("returns null when discovery is unavailable", async () => {
    vi.mocked(fetchServerConnections).mockResolvedValue([]);
    expect(await tryHealServerUrls([server])).toBeNull();
  });

  it("returns null when nothing changed", async () => {
    vi.mocked(fetchServerConnections).mockResolvedValue([
      resource("machine-1", server.serverUrl, server.remoteUrl!),
    ]);
    expect(await tryHealServerUrls([server])).toBeNull();
  });

  it("queries plex.tv once per unique token", async () => {
    vi.mocked(fetchServerConnections).mockResolvedValue([]);
    const second: PlexServerConfig = { ...server, id: "machine-2", name: "Bridge" };
    const third: PlexServerConfig = { ...server, id: "machine-3", name: "TenForward", token: "tok-2" };

    await tryHealServerUrls([server, second, third]);
    expect(fetchServerConnections).toHaveBeenCalledTimes(2);
    expect(fetchServerConnections).toHaveBeenCalledWith("tok-1");
    expect(fetchServerConnections).toHaveBeenCalledWith("tok-2");
  });
});
