import type { ProjectSnapshot } from "./persistence";
import { computeSnapshotHash } from "./persistence";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface CloudCanvasResult {
  id: string;
  title: string;
  data: ProjectSnapshot | null;
  savedAt: number;
  updatedAt: number;
}

/** Fetch cloud canvas snapshot for the authenticated user */
export async function fetchCloudCanvas(signal?: AbortSignal): Promise<CloudCanvasResult | null> {
  try {
    const res = await fetch("/api/canvas/cloud", {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: signal || AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { authenticated: boolean; canvas: CloudCanvasResult | null };
    if (!json.authenticated || !json.canvas) return null;
    return json.canvas;
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      console.warn("fetchCloudCanvas:", err);
    }
    return null;
  }
}

/** Save cloud canvas snapshot for the authenticated user */
export async function saveCloudCanvas(
  snapshot: ProjectSnapshot,
  title?: string,
  signal?: AbortSignal
): Promise<{ success: boolean; savedAt?: number }> {
  try {
    const res = await fetch("/api/canvas/cloud", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot, title }),
      signal: signal || AbortSignal.timeout(15000),
    });
    if (!res.ok) return { success: false };
    const json = (await res.json()) as { success: boolean; savedAt?: number };
    return { success: !!json.success, savedAt: json.savedAt };
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      console.warn("saveCloudCanvas:", err);
    }
    return { success: false };
  }
}

export class CloudSyncEngine {
  private status: CloudSyncStatus = "idle";
  private listeners = new Set<(status: CloudSyncStatus) => void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private syncClearTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSnapshot: ProjectSnapshot | null = null;
  private lastSyncedHash: string | null = null;
  private isSyncing = false;
  private enabled = true;
  private isAuthenticated = false;
  private isBusyCheck?: () => boolean;
  private inFlightController: AbortController | null = null;

  constructor(opts?: {
    onStatusChange?: (status: CloudSyncStatus) => void;
    isBusy?: () => boolean;
    isAuthenticated?: boolean;
  }) {
    if (opts?.onStatusChange) this.listeners.add(opts.onStatusChange);
    this.isBusyCheck = opts?.isBusy;
    this.isAuthenticated = !!opts?.isAuthenticated;
  }

  public subscribe(cb: (status: CloudSyncStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.status);
    return () => this.listeners.delete(cb);
  }

  public getStatus(): CloudSyncStatus {
    return this.status;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (!val) {
      this.cancel();
    }
  }

  public setAuthenticated(val: boolean) {
    const changed = this.isAuthenticated !== val;
    this.isAuthenticated = val;
    if (!val) {
      this.cancel();
      this.setStatus("idle");
    } else if (changed && this.pendingSnapshot) {
      this.scheduleCloudSync(this.pendingSnapshot, 2000);
    }
  }

  public setBusyCheck(fn: () => boolean) {
    this.isBusyCheck = fn;
  }

  public setLastSyncedHash(hash: string | null) {
    this.lastSyncedHash = hash;
  }

  public getLastSyncedHash(): string | null {
    return this.lastSyncedHash;
  }

  public isDirty(snapshot: ProjectSnapshot | null): boolean {
    if (!snapshot) return false;
    const hash = computeSnapshotHash(snapshot);
    return hash !== this.lastSyncedHash;
  }

  private setStatus(status: CloudSyncStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  public cancel() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.syncClearTimer) {
      clearTimeout(this.syncClearTimer);
      this.syncClearTimer = null;
    }
    if (this.inFlightController) {
      this.inFlightController.abort();
      this.inFlightController = null;
    }
    this.pendingSnapshot = null;
  }

  public scheduleCloudSync(snapshot: ProjectSnapshot, delayMs = 4000) {
    // Only signed in users sync to cloud
    if (!this.enabled || !this.isAuthenticated) return;

    // Check if snapshot is identical to what was already synced
    const hash = computeSnapshotHash(snapshot);
    if (this.lastSyncedHash && hash === this.lastSyncedHash) {
      this.pendingSnapshot = null;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      return;
    }

    this.pendingSnapshot = snapshot;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // If user is currently drawing or AI is generating, defer until canvas is idle
      if (this.isBusyCheck?.()) {
        this.scheduleCloudSync(snapshot, 3000);
        return;
      }
      void this.flush();
    }, delayMs);
  }

  public async flush(ignoreBusy = false): Promise<boolean> {
    if (!this.enabled || !this.isAuthenticated || !this.pendingSnapshot || this.isSyncing) {
      return false;
    }

    // Defer flush if user is actively drawing or AI is generating
    if (!ignoreBusy && this.isBusyCheck?.()) {
      if (!this.debounceTimer) {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          void this.flush();
        }, 3000);
      }
      return false;
    }

    const snapshotToSync = this.pendingSnapshot;
    const currentHash = computeSnapshotHash(snapshotToSync);

    // If identical to last synced hash, skip network push
    if (this.lastSyncedHash && currentHash === this.lastSyncedHash) {
      this.pendingSnapshot = null;
      return true;
    }

    this.pendingSnapshot = null;

    if (!navigator.onLine) {
      this.setStatus("offline");
      return false;
    }

    this.isSyncing = true;
    this.setStatus("syncing");

    const controller = new AbortController();
    this.inFlightController = controller;

    try {
      const res = await saveCloudCanvas(snapshotToSync, undefined, controller.signal);
      if (res.success) {
        this.lastSyncedHash = currentHash;
        this.setStatus("synced");
        if (this.syncClearTimer) clearTimeout(this.syncClearTimer);
        this.syncClearTimer = setTimeout(() => {
          if (this.status === "synced") this.setStatus("idle");
        }, 3000);
        return true;
      } else {
        this.setStatus("error");
        return false;
      }
    } catch {
      this.setStatus("error");
      return false;
    } finally {
      this.isSyncing = false;
      if (this.inFlightController === controller) {
        this.inFlightController = null;
      }
      if (this.pendingSnapshot) {
        const nextHash = computeSnapshotHash(this.pendingSnapshot);
        if (nextHash !== this.lastSyncedHash) {
          this.scheduleCloudSync(this.pendingSnapshot, 3500);
        } else {
          this.pendingSnapshot = null;
        }
      }
    }
  }

  public syncNow(snapshot: ProjectSnapshot): Promise<boolean> {
    this.pendingSnapshot = snapshot;
    return this.flush(true);
  }

  public destroy() {
    this.cancel();
    this.listeners.clear();
  }
}
