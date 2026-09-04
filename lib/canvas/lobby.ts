/**
 * Lobby client: presence + pairing requests for permission-based P2P.
 * Signaling only — the canvas itself still flows over PeerJS data channels.
 */

export const LOBBY_PEER_PREFIX = "drawva-user-";
const PEER_ID_KEY = "drawva.lobbyPeerId";

export interface LobbyPeer {
  peerId: string;
  displayName: string;
  peerJsId: string;
  lastSeen: number;
}

export type LobbyRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "canceled"
  | "expired";

export interface LobbyRequest {
  id: string;
  fromPeerId: string;
  fromName: string;
  fromPeerJsId: string;
  toPeerId: string;
  toName: string;
  toPeerJsId: string;
  status: LobbyRequestStatus;
  createdAt: number;
  updatedAt: number;
}

/** Stable per-browser identity for the lobby. */
export function getMyPeerId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(PEER_ID_KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(PEER_ID_KEY, fresh);
    return fresh;
  } catch {
    return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function peerJsIdFor(peerId: string): string {
  return `${LOBBY_PEER_PREFIX}${peerId}`;
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchOnlinePeers(myPeerId: string): Promise<LobbyPeer[]> {
  const res = await fetch(`/api/p2p/presence?exclude=${encodeURIComponent(myPeerId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await readJson<{ peers?: LobbyPeer[] }>(res);
  return Array.isArray(data?.peers) ? data.peers : [];
}

export async function announcePresence(peerId: string, peerJsId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/p2p/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId, peerJsId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function withdrawPresence(peerId: string): void {
  try {
    const url = `/api/p2p/presence?peerId=${encodeURIComponent(peerId)}`;
    void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
  } catch {}
}

export async function fetchIncomingRequests(peerId: string): Promise<LobbyRequest[]> {
  const res = await fetch(
    `/api/p2p/requests?role=incoming&peerId=${encodeURIComponent(peerId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = await readJson<{ requests?: LobbyRequest[] }>(res);
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function fetchOutgoingRequests(peerId: string): Promise<LobbyRequest[]> {
  const res = await fetch(
    `/api/p2p/requests?role=outgoing&peerId=${encodeURIComponent(peerId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = await readJson<{ requests?: LobbyRequest[] }>(res);
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function sendPairingRequest(
  fromPeerId: string,
  fromPeerJsId: string,
  toPeerId: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch("/api/p2p/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPeerId, fromPeerJsId, toPeerId }),
    });
    const data = await readJson<{ success?: boolean; id?: string; error?: string }>(res);
    if (res.ok && data?.success) return { ok: true, id: data.id };
    return { ok: false, error: data?.error || "Failed to send request" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function respondToRequest(
  id: string,
  peerId: string,
  action: "accept" | "reject" | "cancel"
): Promise<{ ok: boolean; request?: LobbyRequest; error?: string }> {
  try {
    const res = await fetch("/api/p2p/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, peerId }),
    });
    const data = await readJson<{ success?: boolean; request?: LobbyRequest; error?: string }>(res);
    if (res.ok && data?.success) return { ok: true, request: data.request };
    return { ok: false, error: data?.error || "Failed to update request" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
