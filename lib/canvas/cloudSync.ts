import type { ProjectSnapshot } from "./persistence";
import { getCanvasSnapshot, saveCanvasSnapshot } from "@/lib/actions/canvas";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface CloudCanvasResult {
  id: string;
  title: string;
  data: ProjectSnapshot | null;
  savedAt: number;
  updatedAt: number;
}

export async function fetchCloudCanvas(): Promise<CloudCanvasResult | null> {
  try {
    const res = await getCanvasSnapshot();
    if (!res.success || !res.canvas) return null;
    return res.canvas;
  } catch (err) {
    console.warn("fetchCloudCanvas:", err);
    return null;
  }
}

export async function saveCloudCanvas(
  snapshot: ProjectSnapshot,
  title?: string
): Promise<{ success: boolean; savedAt?: number }> {
  try {
    const res = await saveCanvasSnapshot(snapshot, title);
    if (!res.success) return { success: false };
    return { success: true, savedAt: res.savedAt };
  } catch (err) {
    console.warn("saveCloudCanvas:", err);
    return { success: false };
  }
}

export class CloudSyncEngine {
  private status: CloudSyncStatus = "idle";
  private listeners = new Set<(status: CloudSyncStatus) => void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSnapshot: ProjectSnapshot | null = null;
  private isSyncing = false;
  private enabled = true;

  constructor(onStatusChange?: (status: CloudSyncStatus) => void) {
    if (onStatusChange) this.listeners.add(onStatusChange);
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
  }

  private setStatus(status: CloudSyncStatus) {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  public scheduleCloudSync(snapshot: ProjectSnapshot, delayMs = 2500) {
    if (!this.enabled) return;
    this.pendingSnapshot = snapshot;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, delayMs);
  }

  public async flush(): Promise<boolean> {
    if (!this.enabled || !this.pendingSnapshot || this.isSyncing) return false;
    const snapshotToSync = this.pendingSnapshot;
    this.pendingSnapshot = null;

    if (!navigator.onLine) {
      this.setStatus("offline");
      return false;
    }

    this.isSyncing = true;
    this.setStatus("syncing");

    try {
      const res = await saveCloudCanvas(snapshotToSync);
      if (res.success) {
        this.setStatus("synced");
        setTimeout(() => {
          if (this.status === "synced") this.setStatus("idle");
        }, 3000);
        return true;
      } else {
        this.setStatus("idle"); // Guest user
        return false;
      }
    } catch {
      this.setStatus("error");
      return false;
    } finally {
      this.isSyncing = false;
      // If changes occurred while syncing, trigger next flush
      if (this.pendingSnapshot) {
        void this.flush();
      }
    }
  }

  public destroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.pendingSnapshot = null;
    this.listeners.clear();
  }
}
