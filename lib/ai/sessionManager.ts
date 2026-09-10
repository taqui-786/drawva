/**
 * sessionManager.ts — AI agent session lifecycle management.
 *
 * Enforces session format: `taqui-{userid}-{random}`
 * Triggers for new sessions:
 *  1. New user login
 *  2. Emergency fallback (missing session on prompt)
 *  3. Clear board
 *  4. Import JSON canvas
 *
 * Model, provider, base URL, and thinking effort changes PRESERVE the active session.
 */

export const ACTIVE_SESSION_ID_KEY = "drawva.agent.activeSessionId";
export const LAST_USER_ID_KEY = "drawva.agent.lastUserId";

/**
 * Generate a new session ID with the contract `taqui-{userid}-{random}`.
 */
export function generateSessionId(userId?: string | null): string {
  const rawUid = userId && typeof userId === "string" ? userId.trim() : "anon";
  const cleanUser = rawUid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "anon";
  const randomSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `taqui-${cleanUser}-${randomSuffix}`;
}

/**
 * Check if a session ID matches the required `taqui-{userid}-{random}` format.
 */
export function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && /^taqui-[A-Za-z0-9_-]{1,80}$/.test(id);
}

/**
 * Safe-SSR retrieval of current active session ID from localStorage.
 */
export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(ACTIVE_SESSION_ID_KEY);
    if (isValidSessionId(val)) return val;
  } catch {}
  return null;
}

/**
 * Safe-SSR persistence of active session ID to localStorage.
 */
export function setActiveSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_SESSION_ID_KEY, sessionId);
  } catch {}
}

/**
 * Create and immediately store a new session in localStorage.
 */
export function createAndStoreSession(userId?: string | null): string {
  const newId = generateSessionId(userId);
  setActiveSessionId(newId);
  return newId;
}

/**
 * Emergency retrieval: returns the active session if present, or creates one on the fly.
 */
export function ensureActiveSessionId(userId?: string | null): string {
  const existing = getActiveSessionId();
  if (existing) return existing;
  return createAndStoreSession(userId);
}
