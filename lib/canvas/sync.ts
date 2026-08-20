import type { ProjectSnapshot } from "./persistence";
import type { ObjectItem } from "./objects";
import type { WidgetItem } from "./widgets";
import type { Point, Rect } from "./types";

export type SyncStatus = "idle" | "hosting" | "connecting" | "connected" | "error";

export interface RemoteCursor {
  peerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  mode: string;
  timestamp: number;
}

export type SyncPacket =
  | { type: "SYNC_INIT_STATE"; snapshot: ProjectSnapshot }
  | { type: "SYNC_SCENE"; widgets: WidgetItem[]; objects: ObjectItem[] }
  | { type: "SYNC_TILES"; tiles: Record<string, string>; done: boolean }
  | { type: "SYNC_STROKE_SEGMENT"; a: Point; b: Point; erase: boolean; size: number; color: string }
  | { type: "SYNC_INK_ERASE"; x: number; y: number; w: number; h: number }
  | { type: "SYNC_INK_MOVE"; from: Rect; x: number; y: number; w: number; h: number; dataUrl: string }
  | { type: "SYNC_OBJECT_ADD"; object: ObjectItem }
  | { type: "SYNC_OBJECT_MOVE"; id: string; x: number; y: number }
  | { type: "SYNC_OBJECT_RESIZE"; id: string; x: number; y: number; w: number; h: number }
  | { type: "SYNC_OBJECT_REMOVE"; id: string }
  | { type: "SYNC_OBJECT_MERGE"; id: string }
  | { type: "SYNC_WIDGET_ADD"; widget: WidgetItem }
  | { type: "SYNC_WIDGET_MOVE"; id: string; x: number; y: number; w: number; h: number; contentW?: number; contentH?: number; userResized?: boolean; resizeMode?: WidgetItem["resizeMode"] }
  | { type: "SYNC_WIDGET_REMOVE"; id: string }
  | { type: "SYNC_CLEAR" }
  | { type: "SYNC_CURSOR"; x: number; y: number; mode: string; color: string; name: string };

export interface SyncHandlers {
  onInitState?: (snapshot: ProjectSnapshot) => void;
  onRemoteStroke?: (segment: { a: Point; b: Point; erase: boolean; size: number; color: string }) => void;
  onRemoteInkErase?: (rect: Rect) => void;
  onRemoteInkMove?: (from: Rect, x: number, y: number, dataUrl: string) => void;
  onRemoteScene?: (widgets: WidgetItem[], objects: ObjectItem[]) => void;
  onRemoteTiles?: (tiles: Record<string, string>, done: boolean) => void;
  onRemoteObjectAdd?: (object: ObjectItem) => void;
  onRemoteObjectMove?: (id: string, x: number, y: number) => void;
  onRemoteObjectResize?: (id: string, x: number, y: number, w: number, h: number) => void;
  onRemoteObjectRemove?: (id: string) => void;
  onRemoteObjectMerge?: (id: string) => void;
  onRemoteWidgetAdd?: (widget: WidgetItem) => void;
  onRemoteWidgetMove?: (id: string, x: number, y: number, w: number, h: number, contentW?: number, contentH?: number, userResized?: boolean, resizeMode?: WidgetItem["resizeMode"]) => void;
  onRemoteWidgetRemove?: (id: string) => void;
  onRemoteClear?: () => void;
  onStatusChange?: (status: SyncStatus, code: string | null, peerCount: number, errorMsg?: string) => void;
  onPeerConnect?: (peerId: string, isHost: boolean) => void;
  onRequestInitialState?: () => ProjectSnapshot | null;
}

export interface PeerConnection {
  peer: string;
  open: boolean;
  send: (data: unknown) => void;
  close: () => void;
  on: (event: string, callback: (arg?: unknown) => void) => void;
}

export interface PeerInstance {
  on: (event: string, callback: (arg?: unknown) => void) => void;
  connect: (peerId: string, options?: { reliable?: boolean; serialization?: string }) => PeerConnection;
  destroy: () => void;
}

const PEER_PREFIX = "drawva-room-";
const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
const SESSION_KEY = "drawva.p2pSession";
const TILE_CHUNK = 4;
const CURSOR_MIN_MS = 50;
const CONNECT_OPTS = { reliable: true, serialization: "json" } as const;

function cloneJson<T>(value: T): T | null {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

export function sanitizePacket(packet: SyncPacket): SyncPacket | null {
  if (packet.type === "SYNC_OBJECT_ADD") {
    const { image, ...object } = packet.object;
    void image;
    return cloneJson({ ...packet, object: object as ObjectItem });
  }
  if (packet.type === "SYNC_WIDGET_ADD") {
    const { cachedImage, ...widget } = packet.widget;
    void cachedImage;
    return cloneJson({ ...packet, widget: widget as WidgetItem });
  }
  if (packet.type === "SYNC_INIT_STATE") {
    const snap = packet.snapshot;
    return cloneJson({
      ...packet,
      snapshot: {
        ...snap,
        widgets: (snap.widgets || []).map((w) => {
          const { cachedImage, ...rest } = w;
          void cachedImage;
          return rest as WidgetItem;
        }),
        objects: (snap.objects || []).map((o) => {
          const { image, ...rest } = o;
          void image;
          return rest as ObjectItem;
        }),
      },
    });
  }
  if (packet.type === "SYNC_SCENE") {
    return cloneJson({
      ...packet,
      widgets: packet.widgets.map((w) => {
        const { cachedImage, ...rest } = w;
        void cachedImage;
        return rest as WidgetItem;
      }),
      objects: packet.objects.map((o) => {
        const { image, ...rest } = o;
        void image;
        return rest as ObjectItem;
      }),
    });
  }
  return packet;
}

export interface StoredP2PSession {
  role: "host" | "joiner";
  roomCode: string;
}

export function getStoredP2PSession(): StoredP2PSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredP2PSession;
  } catch {
    return null;
  }
}

export function setStoredP2PSession(session: StoredP2PSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {}
}

function generateShortCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class SyncManager {
  private peer: PeerInstance | null = null;
  private connections: Map<string, PeerConnection> = new Map();
  private pending = new Map<string, SyncPacket[]>();
  private status: SyncStatus = "idle";
  private roomCode: string | null = null;
  private remoteDepth = 0;
  private handlers: SyncHandlers = {};
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private localName = `Peer-${Math.floor(100 + Math.random() * 900)}`;
  private localColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  private errorMessage: string | undefined = undefined;
  private lastCursorAt = 0;

  constructor() {}

  setHandlers(handlers: SyncHandlers): void {
    this.handlers = handlers;
  }

  getStatus(): { status: SyncStatus; roomCode: string | null; peerCount: number; error?: string } {
    return {
      status: this.status,
      roomCode: this.roomCode,
      peerCount: this.connections.size,
      error: this.errorMessage,
    };
  }

  getRemoteCursors(): RemoteCursor[] {
    const now = Date.now();
    const active: RemoteCursor[] = [];
    for (const [id, cursor] of this.remoteCursors.entries()) {
      if (now - cursor.timestamp < 10000) {
        active.push(cursor);
      } else {
        this.remoteCursors.delete(id);
      }
    }
    return active;
  }

  get isRemote(): boolean {
    return this.remoteDepth > 0;
  }

  beginRemote(): void {
    this.remoteDepth++;
  }

  endRemote(): void {
    this.remoteDepth = Math.max(0, this.remoteDepth - 1);
  }

  async restoreSession(): Promise<boolean> {
    const session = getStoredP2PSession();
    if (!session || !session.roomCode || !session.role) return false;

    try {
      if (session.role === "host") {
        await this.hostSession(session.roomCode);
        return true;
      } else if (session.role === "joiner") {
        await this.joinSession(session.roomCode);
        return true;
      }
    } catch (err) {
      console.warn("[SyncManager] Failed to restore P2P session:", err);
      this.disconnect(true);
    }
    return false;
  }

  async hostSession(customCode?: string): Promise<string> {
    this.disconnect(false);
    const code = customCode ? customCode.trim().toUpperCase() : generateShortCode();
    this.roomCode = code;
    this.status = "hosting";
    this.errorMessage = undefined;
    setStoredP2PSession({ role: "host", roomCode: code });
    this.notifyStatus();

    const PeerModule = await import("peerjs");
    const Peer = PeerModule.Peer;

    const fullPeerId = `${PEER_PREFIX}${code}`;
    const peerInstance = new Peer(fullPeerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    }) as unknown as PeerInstance;
    this.peer = peerInstance;

    this.peer.on("open", () => {
      this.status = "hosting";
      this.notifyStatus();
    });

    this.peer.on("connection", (conn: unknown) => {
      this.setupConnection(conn as PeerConnection, true);
    });

    this.peer.on("error", (err: unknown) => {
      console.error("[SyncManager] Peer error:", err);
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "Failed to initialize host connection";
      this.status = "error";
      this.errorMessage = msg;
      setStoredP2PSession(null);
      this.notifyStatus();
    });

    return code;
  }

  async joinSession(rawCode: string): Promise<void> {
    this.disconnect(false);
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) throw new Error("Invalid session code");

    this.roomCode = code;
    this.status = "connecting";
    this.errorMessage = undefined;
    setStoredP2PSession({ role: "joiner", roomCode: code });
    this.notifyStatus();

    const PeerModule = await import("peerjs");
    const Peer = PeerModule.Peer;

    const peerInstance = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    }) as unknown as PeerInstance;
    this.peer = peerInstance;

    this.peer.on("open", () => {
      const fullPeerId = `${PEER_PREFIX}${code}`;
      const conn = this.peer?.connect(fullPeerId, CONNECT_OPTS);
      if (conn) {
        this.setupConnection(conn, false);
      }
    });

    this.peer.on("error", (err: unknown) => {
      console.error("[SyncManager] Join peer error:", err);
      this.status = "error";
      this.errorMessage = "Could not find host with this code";
      setStoredP2PSession(null);
      this.notifyStatus();
    });
  }

  private setupConnection(conn: PeerConnection, isHost: boolean): void {
    let opened = false;
    const onOpen = () => {
      if (opened) return;
      opened = true;
      this.connections.set(conn.peer, conn);
      this.status = "connected";
      this.notifyStatus();
      this.flushPending(conn);
      this.handlers.onPeerConnect?.(conn.peer, isHost);

      if (isHost) {
        const snapshot = this.handlers.onRequestInitialState?.();
        if (snapshot) this.sendSnapshot(conn, snapshot);
      }
    };
    conn.on("open", onOpen);
    if (conn.open) onOpen();

    conn.on("data", (data: unknown) => {
      this.handlePacket(conn.peer, data as SyncPacket);
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);
      this.pending.delete(conn.peer);
      this.remoteCursors.delete(conn.peer);
      if (this.connections.size === 0 && !isHost) {
        this.status = "idle";
        this.roomCode = null;
      } else if (this.connections.size === 0 && isHost) {
        this.status = "hosting";
      }
      this.notifyStatus();
    });

    conn.on("error", (err: unknown) => {
      console.error("[SyncManager] Connection error:", err);
      this.connections.delete(conn.peer);
      this.notifyStatus();
    });
  }

  private sendSnapshot(conn: PeerConnection, snapshot: ProjectSnapshot): void {
    this.sendTo(conn, {
      type: "SYNC_SCENE",
      widgets: snapshot.widgets || [],
      objects: snapshot.objects || [],
    });
    const entries = Object.entries(snapshot.tiles || {});
    if (entries.length === 0) {
      this.sendTo(conn, { type: "SYNC_TILES", tiles: {}, done: true });
      return;
    }
    for (let i = 0; i < entries.length; i += TILE_CHUNK) {
      const chunk = Object.fromEntries(entries.slice(i, i + TILE_CHUNK));
      this.sendTo(conn, { type: "SYNC_TILES", tiles: chunk, done: i + TILE_CHUNK >= entries.length });
    }
  }

  private sendTo(conn: PeerConnection, packet: SyncPacket): void {
    const safe = sanitizePacket(packet);
    if (!safe) {
      console.warn("[SyncManager] Dropped unserializable packet", packet.type);
      return;
    }
    if (!conn.open) {
      const q = this.pending.get(conn.peer) ?? [];
      q.push(safe);
      this.pending.set(conn.peer, q);
      return;
    }
    try {
      conn.send(safe);
    } catch (err) {
      console.warn("[SyncManager] Send failed:", packet.type, err);
    }
  }

  private flushPending(conn: PeerConnection): void {
    const q = this.pending.get(conn.peer);
    if (!q?.length) return;
    this.pending.delete(conn.peer);
    for (const packet of q) this.sendTo(conn, packet);
  }

  private handlePacket(senderId: string, packet: SyncPacket): void {
    const safePacket = sanitizePacket(packet);
    if (!safePacket) return;
    for (const [id, conn] of this.connections.entries()) {
      if (id !== senderId) this.sendTo(conn, safePacket);
    }

    this.beginRemote();
    try {
      switch (safePacket.type) {
        case "SYNC_INIT_STATE":
          this.handlers.onInitState?.(safePacket.snapshot);
          break;
        case "SYNC_SCENE":
          this.handlers.onRemoteScene?.(safePacket.widgets, safePacket.objects);
          break;
        case "SYNC_TILES":
          this.handlers.onRemoteTiles?.(safePacket.tiles, safePacket.done);
          break;
        case "SYNC_STROKE_SEGMENT":
          this.handlers.onRemoteStroke?.(safePacket);
          break;
        case "SYNC_INK_ERASE":
          this.handlers.onRemoteInkErase?.({ x: safePacket.x, y: safePacket.y, w: safePacket.w, h: safePacket.h });
          break;
        case "SYNC_INK_MOVE":
          this.handlers.onRemoteInkMove?.(safePacket.from, safePacket.x, safePacket.y, safePacket.dataUrl);
          break;
        case "SYNC_OBJECT_ADD":
          this.handlers.onRemoteObjectAdd?.(safePacket.object);
          break;
        case "SYNC_OBJECT_MOVE":
          this.handlers.onRemoteObjectMove?.(safePacket.id, safePacket.x, safePacket.y);
          break;
        case "SYNC_OBJECT_RESIZE":
          this.handlers.onRemoteObjectResize?.(safePacket.id, safePacket.x, safePacket.y, safePacket.w, safePacket.h);
          break;
        case "SYNC_OBJECT_REMOVE":
          this.handlers.onRemoteObjectRemove?.(safePacket.id);
          break;
        case "SYNC_OBJECT_MERGE":
          this.handlers.onRemoteObjectMerge?.(safePacket.id);
          break;
        case "SYNC_WIDGET_ADD":
          this.handlers.onRemoteWidgetAdd?.(safePacket.widget);
          break;
        case "SYNC_WIDGET_MOVE":
          this.handlers.onRemoteWidgetMove?.(
            safePacket.id,
            safePacket.x,
            safePacket.y,
            safePacket.w,
            safePacket.h,
            safePacket.contentW,
            safePacket.contentH,
            safePacket.userResized,
            safePacket.resizeMode
          );
          break;
        case "SYNC_WIDGET_REMOVE":
          this.handlers.onRemoteWidgetRemove?.(safePacket.id);
          break;
        case "SYNC_CLEAR":
          this.handlers.onRemoteClear?.();
          break;
        case "SYNC_CURSOR":
          this.remoteCursors.set(senderId, {
            peerId: senderId,
            name: safePacket.name,
            color: safePacket.color,
            x: safePacket.x,
            y: safePacket.y,
            mode: safePacket.mode,
            timestamp: Date.now(),
          });
          break;
      }
    } finally {
      this.endRemote();
    }
  }

  broadcast(packet: SyncPacket): void {
    if (this.isRemote || this.connections.size === 0) return;
    const safePacket = sanitizePacket(packet);
    if (!safePacket) {
      console.warn("[SyncManager] Dropped unserializable broadcast", packet.type);
      return;
    }
    for (const conn of this.connections.values()) this.sendTo(conn, safePacket);
  }

  sendCursor(x: number, y: number, mode: string): void {
    if (this.connections.size === 0) return;
    const now = performance.now();
    if (now - this.lastCursorAt < CURSOR_MIN_MS) return;
    this.lastCursorAt = now;
    this.broadcast({
      type: "SYNC_CURSOR",
      x,
      y,
      mode,
      color: this.localColor,
      name: this.localName,
    });
  }

  disconnect(clearStorage = true): void {
    if (clearStorage) {
      setStoredP2PSession(null);
    }
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.connections.clear();
    this.pending.clear();
    this.remoteCursors.clear();
    this.remoteDepth = 0;
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    this.status = "idle";
    this.roomCode = null;
    this.errorMessage = undefined;
    this.notifyStatus();
  }

  private notifyStatus(): void {
    this.handlers.onStatusChange?.(this.status, this.roomCode, this.connections.size, this.errorMessage);
  }
}
