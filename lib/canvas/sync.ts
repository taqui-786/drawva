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

/**
 * Soft ceiling for a single PeerJS JSON payload.
 * Many browsers still negotiate ~16KiB RTCDataChannel messages; stay under that
 * after JSON framing or AI widget HTML never arrives while tiny eraser packets do.
 */
export const MAX_PACKET_CHARS = 12_000;
const HTML_CHUNK_CHARS = 8_000;
const DATA_URL_CHUNK_CHARS = 8_000;
/** One tile per packet keeps PNG dataURLs under PeerJS payload limits. */
const TILE_CHUNK = 1;
const CURSOR_MIN_MS = 50;
const PEER_PREFIX = "drawva-room-";
const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
const SESSION_KEY = "drawva.p2pSession";
const CONNECT_OPTS = { reliable: true, serialization: "json" } as const;
const PART_TTL_MS = 60_000;

type WidgetMeta = Omit<WidgetItem, "html" | "cachedImage">;

export type SyncPacket =
  | { type: "SYNC_INIT_STATE"; snapshot: ProjectSnapshot }
  | { type: "SYNC_SCENE"; widgets: WidgetItem[]; objects: ObjectItem[] }
  | { type: "SYNC_TILES"; tiles: Record<string, string>; done: boolean }
  | { type: "SYNC_TILE_PART"; key: string; index: number; total: number; chunk: string; done: boolean }
  | { type: "SYNC_STROKE_SEGMENT"; a: Point; b: Point; erase: boolean; size: number; color: string }
  | { type: "SYNC_INK_ERASE"; x: number; y: number; w: number; h: number }
  | { type: "SYNC_INK_MOVE"; from: Rect; x: number; y: number; w: number; h: number; dataUrl: string }
  | {
      type: "SYNC_INK_MOVE_PART";
      from: Rect;
      x: number;
      y: number;
      w: number;
      h: number;
      index: number;
      total: number;
      chunk: string;
    }
  | { type: "SYNC_OBJECT_ADD"; object: ObjectItem }
  | { type: "SYNC_OBJECT_MOVE"; id: string; x: number; y: number }
  | { type: "SYNC_OBJECT_RESIZE"; id: string; x: number; y: number; w: number; h: number }
  | { type: "SYNC_OBJECT_REMOVE"; id: string }
  | { type: "SYNC_OBJECT_MERGE"; id: string }
  | { type: "SYNC_WIDGET_ADD"; widget: WidgetItem }
  | {
      type: "SYNC_WIDGET_PART";
      id: string;
      index: number;
      total: number;
      meta?: WidgetMeta;
      htmlChunk: string;
    }
  | {
      type: "SYNC_WIDGET_MOVE";
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      contentW?: number;
      contentH?: number;
      userResized?: boolean;
      resizeMode?: WidgetItem["resizeMode"];
    }
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
  onRemoteWidgetMove?: (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    contentW?: number,
    contentH?: number,
    userResized?: boolean,
    resizeMode?: WidgetItem["resizeMode"]
  ) => void;
  onRemoteWidgetRemove?: (id: string) => void;
  onRemoteClear?: () => void;
  onStatusChange?: (status: SyncStatus, code: string | null, peerCount: number, errorMsg?: string, peerName?: string | null) => void;
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
  off?: (event: string, callback?: (arg?: unknown) => void) => void;
  connect: (peerId: string, options?: Record<string, unknown>) => PeerConnection;
  destroy: () => void;
}

interface WidgetPartBuffer {
  meta?: WidgetMeta;
  chunks: string[];
  total: number;
  updatedAt: number;
}

interface InkMovePartBuffer {
  from: Rect;
  x: number;
  y: number;
  w: number;
  h: number;
  chunks: string[];
  total: number;
  updatedAt: number;
}

interface TilePartBuffer {
  chunks: string[];
  total: number;
  done: boolean;
  updatedAt: number;
}

function cloneJson<T>(value: T): T | null {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

function packetChars(packet: SyncPacket): number {
  try {
    return JSON.stringify(packet).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function chunkString(value: string, size: number): string[] {
  if (!value) return [""];
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts.length ? parts : [""];
}

function stripWidget(widget: WidgetItem): WidgetItem {
  const { cachedImage, ...rest } = widget;
  void cachedImage;
  return rest as WidgetItem;
}

function stripObject(object: ObjectItem): ObjectItem {
  const { image, ...rest } = object;
  void image;
  return rest as ObjectItem;
}

/**
 * Diagram iframes ship a huge pre-rendered HTML document (inline SVG / CDN loaders).
 * Sync the compact source instead and re-render with diagramDocument on the peer.
 */
export function compactWidgetForSync(widget: WidgetItem): WidgetItem {
  const base = stripWidget(widget);
  const hasSource = typeof base.copyText === "string" && base.copyText.length > 0;
  const canRebuild =
    hasSource &&
    (base.kind === "diagram" ||
      !!base.sourceFormat ||
      base.pluginId === "flowchart" ||
      base.pluginId === "diagram");
  if (canRebuild) {
    return { ...base, html: "" };
  }
  return base;
}

export function widgetNeedsHydration(widget: WidgetItem): boolean {
  const hasSource = typeof widget.copyText === "string" && widget.copyText.length > 0;
  if (!hasSource) return false;
  const html = widget.html || "";
  return html.length < 32;
}

export function sanitizePacket(packet: SyncPacket): SyncPacket | null {
  if (packet.type === "SYNC_OBJECT_ADD") {
    return cloneJson({ ...packet, object: stripObject(packet.object) });
  }
  if (packet.type === "SYNC_WIDGET_ADD") {
    return cloneJson({ ...packet, widget: compactWidgetForSync(packet.widget) });
  }
  if (packet.type === "SYNC_WIDGET_PART") {
    const meta = packet.meta
      ? (compactWidgetForSync(packet.meta as WidgetItem) as WidgetMeta)
      : undefined;
    return cloneJson({ ...packet, meta });
  }
  if (packet.type === "SYNC_INIT_STATE") {
    const snap = packet.snapshot;
    return cloneJson({
      ...packet,
      snapshot: {
        ...snap,
        widgets: (snap.widgets || []).map(compactWidgetForSync),
        objects: (snap.objects || []).map(stripObject),
      },
    });
  }
  if (packet.type === "SYNC_SCENE") {
    return cloneJson({
      ...packet,
      widgets: packet.widgets.map(compactWidgetForSync),
      objects: packet.objects.map(stripObject),
    });
  }
  // Lightweight packets are already JSON-safe; avoid an extra clone on the hot stroke path.
  if (
    packet.type === "SYNC_STROKE_SEGMENT" ||
    packet.type === "SYNC_INK_ERASE" ||
    packet.type === "SYNC_OBJECT_MOVE" ||
    packet.type === "SYNC_OBJECT_RESIZE" ||
    packet.type === "SYNC_OBJECT_REMOVE" ||
    packet.type === "SYNC_OBJECT_MERGE" ||
    packet.type === "SYNC_WIDGET_MOVE" ||
    packet.type === "SYNC_WIDGET_REMOVE" ||
    packet.type === "SYNC_CLEAR" ||
    packet.type === "SYNC_CURSOR" ||
    packet.type === "SYNC_INK_MOVE_PART" ||
    packet.type === "SYNC_TILE_PART"
  ) {
    return packet;
  }
  return cloneJson(packet);
}

/** Expand oversized packets into PeerJS-safe pieces (widgets / ink moves / scenes). */
export function expandPacket(packet: SyncPacket): SyncPacket[] {
  const safe = sanitizePacket(packet);
  if (!safe) return [];

  // Never ship a mega SCENE blob — clear, then fan out each widget/object.
  if (safe.type === "SYNC_SCENE") {
    const out: SyncPacket[] = [{ type: "SYNC_SCENE", widgets: [], objects: [] }];
    for (const widget of safe.widgets || []) {
      out.push(...expandPacket({ type: "SYNC_WIDGET_ADD", widget }));
    }
    for (const object of safe.objects || []) {
      out.push(...expandPacket({ type: "SYNC_OBJECT_ADD", object }));
    }
    return out;
  }

  if (safe.type === "SYNC_WIDGET_ADD") {
    const widget = compactWidgetForSync(safe.widget);
    const asAdd: SyncPacket = { type: "SYNC_WIDGET_ADD", widget };
    // Compact diagrams (empty html + source) usually fit; applets still chunk.
    if (packetChars(asAdd) <= MAX_PACKET_CHARS) return [asAdd];
    const { html = "", ...meta } = widget;
    const chunks = chunkString(html, HTML_CHUNK_CHARS);
    return chunks.map((htmlChunk, index) => ({
      type: "SYNC_WIDGET_PART" as const,
      id: widget.id,
      index,
      total: chunks.length,
      meta: index === 0 ? (meta as WidgetMeta) : undefined,
      htmlChunk,
    }));
  }

  if (safe.type === "SYNC_INK_MOVE") {
    if (packetChars(safe) <= MAX_PACKET_CHARS) return [safe];
    const chunks = chunkString(safe.dataUrl, DATA_URL_CHUNK_CHARS);
    return chunks.map((chunk, index) => ({
      type: "SYNC_INK_MOVE_PART" as const,
      from: safe.from,
      x: safe.x,
      y: safe.y,
      w: safe.w,
      h: safe.h,
      index,
      total: chunks.length,
      chunk,
    }));
  }

  if (safe.type === "SYNC_TILES") {
    const entries = Object.entries(safe.tiles || {});
    if (entries.length === 0) return [safe];
    if (packetChars(safe) <= MAX_PACKET_CHARS) return [safe];

    const out: SyncPacket[] = [];
    for (let i = 0; i < entries.length; i++) {
      const [key, dataUrl] = entries[i];
      const isLastEntry = i === entries.length - 1;
      const tileDone = safe.done && isLastEntry;
      const single: SyncPacket = { type: "SYNC_TILES", tiles: { [key]: dataUrl }, done: tileDone };
      if (packetChars(single) <= MAX_PACKET_CHARS) {
        out.push(single);
        continue;
      }
      const chunks = chunkString(dataUrl, DATA_URL_CHUNK_CHARS);
      for (let index = 0; index < chunks.length; index++) {
        out.push({
          type: "SYNC_TILE_PART",
          key,
          index,
          total: chunks.length,
          chunk: chunks[index],
          done: tileDone && index === chunks.length - 1,
        });
      }
    }
    return out;
  }

  // Full snapshots must be sent via broadcastSnapshot / sendSnapshot (SCENE + TILES).
  if (safe.type === "SYNC_INIT_STATE") {
    return [];
  }

  return [safe];
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
  /** Depth of *synchronous* remote apply. Must never stay elevated across awaits. */
  private remoteDepth = 0;
  private handlers: SyncHandlers = {};
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private localName = `Peer-${Math.floor(100 + Math.random() * 900)}`;
  private localColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  private errorMessage: string | undefined = undefined;
  private lastCursorAt = 0;
  /** Lobby (permission) mode: only dials carrying an authorized requestId are accepted. */
  private lobbyMode = false;
  /** requestId → requester display name, filled when the user accepts a pairing request. */
  private allowedRequests = new Map<string, string>();
  /** Display name of the currently connected lobby peer (last one in). */
  private connectedPeerName: string | null = null;
  private pendingPeerName: string | null = null;
  private widgetParts = new Map<string, WidgetPartBuffer>();
  private inkMoveParts = new Map<string, InkMovePartBuffer>();
  private tileParts = new Map<string, TilePartBuffer>();

  constructor() {}

  setHandlers(handlers: SyncHandlers): void {
    this.handlers = handlers;
  }

  getStatus(): { status: SyncStatus; roomCode: string | null; peerCount: number; peerName: string | null; error?: string } {
    return {
      status: this.status,
      roomCode: this.roomCode,
      peerCount: this.connections.size,
      peerName: this.connectedPeerName,
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

  /** Run a synchronous remote apply that may re-enter local stroke/ink hooks. */
  runRemote(fn: () => void): void {
    this.beginRemote();
    try {
      fn();
    } finally {
      this.endRemote();
    }
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
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to initialize host connection";
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
      this.connectedPeerName = this.pendingPeerName;
      this.pendingPeerName = null;
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
        this.connectedPeerName = null;
      } else if (this.connections.size === 0 && isHost) {
        this.status = "hosting";
        this.connectedPeerName = null;
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

  /** Fan-out a full board snapshot as SCENE + chunked TILES (never one giant INIT packet). */
  broadcastSnapshot(snapshot: ProjectSnapshot): void {
    if (this.isRemote || this.connections.size === 0) return;
    this.broadcast({
      type: "SYNC_SCENE",
      widgets: snapshot.widgets || [],
      objects: snapshot.objects || [],
    });
    const entries = Object.entries(snapshot.tiles || {});
    if (entries.length === 0) {
      this.broadcast({ type: "SYNC_TILES", tiles: {}, done: true });
      return;
    }
    for (let i = 0; i < entries.length; i += TILE_CHUNK) {
      const chunk = Object.fromEntries(entries.slice(i, i + TILE_CHUNK));
      this.broadcast({ type: "SYNC_TILES", tiles: chunk, done: i + TILE_CHUNK >= entries.length });
    }
  }

  private outbound: Array<{ peerId: string; packet: SyncPacket }> = [];
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;

  private rawSend(conn: PeerConnection, packet: SyncPacket): void {
    if (!conn.open) {
      const q = this.pending.get(conn.peer) ?? [];
      q.push(packet);
      this.pending.set(conn.peer, q);
      return;
    }
    try {
      conn.send(packet);
    } catch (err) {
      console.warn("[SyncManager] Send failed:", packet.type, err);
      const q = this.pending.get(conn.peer) ?? [];
      q.push(packet);
      this.pending.set(conn.peer, q);
    }
  }

  private enqueueSend(conn: PeerConnection, packet: SyncPacket): void {
    // Pace multi-part / heavy payloads so the RTCDataChannel buffer does not
    // silently drop AI widget chunks. Lightweight strokes stay immediate.
    const heavy =
      packet.type === "SYNC_WIDGET_ADD" ||
      packet.type === "SYNC_WIDGET_PART" ||
      packet.type === "SYNC_TILES" ||
      packet.type === "SYNC_TILE_PART" ||
      packet.type === "SYNC_INK_MOVE" ||
      packet.type === "SYNC_INK_MOVE_PART" ||
      packet.type === "SYNC_SCENE" ||
      packet.type === "SYNC_OBJECT_ADD";
    if (!heavy) {
      this.rawSend(conn, packet);
      return;
    }
    this.outbound.push({ peerId: conn.peer, packet });
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpTimer != null) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.pumpOutbound();
    }, 0);
  }

  private pumpOutbound(): void {
    const next = this.outbound.shift();
    if (!next) return;
    const conn = this.connections.get(next.peerId);
    if (conn) this.rawSend(conn, next.packet);
    if (this.outbound.length) {
      this.pumpTimer = setTimeout(() => {
        this.pumpTimer = null;
        this.pumpOutbound();
      }, 6);
    }
  }

  private sendTo(conn: PeerConnection, packet: SyncPacket): void {
    const pieces = expandPacket(packet);
    if (!pieces.length) {
      if (packet.type !== "SYNC_INIT_STATE") {
        console.warn("[SyncManager] Dropped unserializable packet", packet.type);
      }
      return;
    }
    for (const piece of pieces) this.enqueueSend(conn, piece);
  }

  private flushPending(conn: PeerConnection): void {
    const q = this.pending.get(conn.peer);
    if (!q?.length) return;
    this.pending.delete(conn.peer);
    for (const packet of q) this.sendTo(conn, packet);
  }

  private prunePartBuffers(now = Date.now()): void {
    for (const [key, buf] of this.widgetParts) {
      if (now - buf.updatedAt > PART_TTL_MS) this.widgetParts.delete(key);
    }
    for (const [key, buf] of this.inkMoveParts) {
      if (now - buf.updatedAt > PART_TTL_MS) this.inkMoveParts.delete(key);
    }
    for (const [key, buf] of this.tileParts) {
      if (now - buf.updatedAt > PART_TTL_MS) this.tileParts.delete(key);
    }
  }

  private ingestTilePart(
    packet: Extract<SyncPacket, { type: "SYNC_TILE_PART" }>
  ): { tiles: Record<string, string>; done: boolean } | null {
    this.prunePartBuffers();
    const key = packet.key;
    let buf = this.tileParts.get(key);
    if (!buf || buf.total !== packet.total) {
      buf = {
        chunks: new Array(packet.total),
        total: packet.total,
        done: false,
        updatedAt: Date.now(),
      };
      this.tileParts.set(key, buf);
    }
    buf.chunks[packet.index] = packet.chunk;
    buf.done = buf.done || packet.done;
    buf.updatedAt = Date.now();
    for (let i = 0; i < buf.total; i++) {
      if (typeof buf.chunks[i] !== "string") return null;
    }
    const dataUrl = buf.chunks.join("");
    const done = buf.done;
    this.tileParts.delete(key);
    return { tiles: { [key]: dataUrl }, done };
  }

  private ingestWidgetPart(packet: Extract<SyncPacket, { type: "SYNC_WIDGET_PART" }>): WidgetItem | null {
    this.prunePartBuffers();
    const key = packet.id;
    let buf = this.widgetParts.get(key);
    if (!buf || buf.total !== packet.total) {
      buf = {
        meta: packet.meta,
        chunks: new Array(packet.total),
        total: packet.total,
        updatedAt: Date.now(),
      };
      this.widgetParts.set(key, buf);
    } else if (packet.meta) {
      buf.meta = packet.meta;
    }
    buf.chunks[packet.index] = packet.htmlChunk;
    buf.updatedAt = Date.now();

    if (!buf.meta) return null;
    for (let i = 0; i < buf.total; i++) {
      if (typeof buf.chunks[i] !== "string") return null;
    }
    const widget = { ...buf.meta, html: buf.chunks.join("") } as WidgetItem;
    this.widgetParts.delete(key);
    return widget;
  }

  private ingestInkMovePart(
    packet: Extract<SyncPacket, { type: "SYNC_INK_MOVE_PART" }>,
    senderId: string
  ): { from: Rect; x: number; y: number; dataUrl: string } | null {
    this.prunePartBuffers();
    const key = `${senderId}:${packet.x},${packet.y},${packet.w},${packet.h}:${packet.total}`;
    let buf = this.inkMoveParts.get(key);
    if (!buf || buf.total !== packet.total) {
      buf = {
        from: packet.from,
        x: packet.x,
        y: packet.y,
        w: packet.w,
        h: packet.h,
        chunks: new Array(packet.total),
        total: packet.total,
        updatedAt: Date.now(),
      };
      this.inkMoveParts.set(key, buf);
    }
    buf.chunks[packet.index] = packet.chunk;
    buf.updatedAt = Date.now();
    for (let i = 0; i < buf.total; i++) {
      if (typeof buf.chunks[i] !== "string") return null;
    }
    const dataUrl = buf.chunks.join("");
    this.inkMoveParts.delete(key);
    return { from: buf.from, x: buf.x, y: buf.y, dataUrl };
  }

  private handlePacket(senderId: string, packet: SyncPacket): void {
    const safePacket = sanitizePacket(packet);
    if (!safePacket) return;

    // Relay first so mesh peers keep moving even if local apply is heavy.
    for (const [id, conn] of this.connections.entries()) {
      if (id !== senderId) this.sendTo(conn, safePacket);
    }

    this.dispatchPacket(senderId, safePacket);
  }

  private dispatchPacket(senderId: string, safePacket: SyncPacket): void {
    // Only the stroke path re-enters local sync hooks; keep the remote guard strictly sync.
    const apply = () => {
      switch (safePacket.type) {
        case "SYNC_INIT_STATE":
          // Legacy single-packet snapshots (older peers / tests). Prefer SCENE+TILES.
          this.handlers.onInitState?.(safePacket.snapshot);
          break;
        case "SYNC_SCENE":
          this.handlers.onRemoteScene?.(safePacket.widgets, safePacket.objects);
          break;
        case "SYNC_TILES":
          this.handlers.onRemoteTiles?.(safePacket.tiles, safePacket.done);
          break;
        case "SYNC_TILE_PART": {
          const assembled = this.ingestTilePart(safePacket);
          if (assembled) this.handlers.onRemoteTiles?.(assembled.tiles, assembled.done);
          break;
        }
        case "SYNC_STROKE_SEGMENT":
          this.handlers.onRemoteStroke?.(safePacket);
          break;
        case "SYNC_INK_ERASE":
          this.handlers.onRemoteInkErase?.({
            x: safePacket.x,
            y: safePacket.y,
            w: safePacket.w,
            h: safePacket.h,
          });
          break;
        case "SYNC_INK_MOVE":
          this.handlers.onRemoteInkMove?.(safePacket.from, safePacket.x, safePacket.y, safePacket.dataUrl);
          break;
        case "SYNC_INK_MOVE_PART": {
          const assembled = this.ingestInkMovePart(safePacket, senderId);
          if (assembled) {
            this.handlers.onRemoteInkMove?.(assembled.from, assembled.x, assembled.y, assembled.dataUrl);
          }
          break;
        }
        case "SYNC_OBJECT_ADD":
          this.handlers.onRemoteObjectAdd?.(safePacket.object);
          break;
        case "SYNC_OBJECT_MOVE":
          this.handlers.onRemoteObjectMove?.(safePacket.id, safePacket.x, safePacket.y);
          break;
        case "SYNC_OBJECT_RESIZE":
          this.handlers.onRemoteObjectResize?.(
            safePacket.id,
            safePacket.x,
            safePacket.y,
            safePacket.w,
            safePacket.h
          );
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
        case "SYNC_WIDGET_PART": {
          const widget = this.ingestWidgetPart(safePacket);
          if (widget) this.handlers.onRemoteWidgetAdd?.(widget);
          break;
        }
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
    };

    if (safePacket.type === "SYNC_STROKE_SEGMENT") {
      this.runRemote(apply);
    } else {
      apply();
    }
  }

  broadcast(packet: SyncPacket): void {
    if (this.isRemote || this.connections.size === 0) return;
    if (packet.type === "SYNC_INIT_STATE") {
      this.broadcastSnapshot(packet.snapshot);
      return;
    }
    const pieces = expandPacket(packet);
    if (!pieces.length) {
      console.warn("[SyncManager] Dropped unserializable broadcast", packet.type);
      return;
    }
    for (const piece of pieces) {
      for (const conn of this.connections.values()) this.sendTo(conn, piece);
    }
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
    this.outbound = [];
    if (this.pumpTimer != null) {
      clearTimeout(this.pumpTimer);
      this.pumpTimer = null;
    }
    this.remoteCursors.clear();
    this.widgetParts.clear();
    this.inkMoveParts.clear();
    this.tileParts.clear();
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
    this.lobbyMode = false;
    this.allowedRequests.clear();
    this.connectedPeerName = null;
    this.pendingPeerName = null;
    this.notifyStatus();
  }

  private notifyStatus(): void {
    this.handlers.onStatusChange?.(this.status, this.roomCode, this.connections.size, this.errorMessage, this.connectedPeerName);
  }

  /** Display name shown on remote cursors. Defaults to a random Peer-###. */
  setLocalName(name: string): void {
    const clean = name.trim().slice(0, 48);
    if (clean) this.localName = clean;
  }

  /**
   * Authorize an accepted pairing request: the requester's dial (which carries
   * this requestId as PeerJS connection metadata) will be let in.
   */
  authorizeRequest(requestId: string, peerName: string): void {
    this.allowedRequests.set(requestId, peerName);
  }

  /**
   * Lobby "open connection": register my stable PeerJS id and listen for
   * authorized dials. Resolves once the PeerJS cloud acknowledges us.
   */
  async goOnline(fullPeerJsId: string): Promise<void> {
    this.disconnect(false);
    this.lobbyMode = true;
    this.roomCode = null;
    this.status = "connecting";
    this.errorMessage = undefined;
    this.notifyStatus();

    const PeerModule = await import("peerjs");
    const Peer = PeerModule.Peer;
    const peerInstance = new Peer(fullPeerJsId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    }) as unknown as PeerInstance;
    this.peer = peerInstance;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out reaching the connection server")), 20000);
      const onOpen = () => {
        if (this.peer !== peerInstance) return;
        clearTimeout(timer);
        this.status = "hosting";
        this.notifyStatus();
        resolve();
      };
      const onError = (err: unknown) => {
        if (this.peer !== peerInstance) return;
        clearTimeout(timer);
        console.error("[SyncManager] goOnline peer error:", err);
        const msg =
          err && typeof err === "object" && "type" in err && (err as { type: string }).type === "unavailable-id"
            ? "You are already online in another tab"
            : "Could not open connection (check network)";
        this.status = "error";
        this.errorMessage = msg;
        this.notifyStatus();
        reject(new Error(msg));
      };
      peerInstance.on("open", onOpen);
      peerInstance.on("error", onError);
    });

    peerInstance.on("connection", (conn: unknown) => {
      const meta = (conn as { metadata?: { requestId?: string } })?.metadata;
      const requestId = meta?.requestId;
      const typed = conn as PeerConnection;
      if (typeof requestId === "string" && this.allowedRequests.has(requestId)) {
        this.pendingPeerName = this.allowedRequests.get(requestId) ?? null;
        this.allowedRequests.delete(requestId);
        this.setupConnection(typed, true);
      } else {
        // Lobby mode never accepts unsolicited dials.
        try {
          typed.close();
        } catch {}
      }
    });
  }

  /**
   * Dial a specific online user after they accepted the pairing request.
   * The requestId travels as connection metadata so the other side lets us in.
   */
  async connectToPeer(
    targetPeerJsId: string,
    opts?: { requestId?: string; peerName?: string }
  ): Promise<void> {
    this.disconnect(false);
    this.lobbyMode = true;
    this.roomCode = null;
    this.status = "connecting";
    this.errorMessage = undefined;
    this.pendingPeerName = opts?.peerName ?? null;
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
      if (this.peer !== peerInstance) return;
      const conn = this.peer?.connect(targetPeerJsId, {
        ...CONNECT_OPTS,
        metadata: opts?.requestId ? { requestId: opts.requestId } : undefined,
      });
      if (conn) {
        this.setupConnection(conn, false);
      }
    });

    this.peer.on("error", (err: unknown) => {
      if (this.peer !== peerInstance) return;
      console.error("[SyncManager] connectToPeer error:", err);
      this.status = "error";
      this.errorMessage = "Could not reach that user (they may have gone offline)";
      this.pendingPeerName = null;
      this.notifyStatus();
    });
  }
}
