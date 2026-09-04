import type { Context } from "@deepseek-ai/cordis";
import CredentialProvider, {
  credentialRef,
  type CredentialKey,
  type CredentialRecord,
  type CredentialRef,
} from "@deepseek-ai/dsh-credentials";
import { createHash } from "node:crypto";

/* eslint-disable @typescript-eslint/no-unused-vars -- record-half params intentionally unused */

/**
 * Map-backed credential provider for Drawva.
 *
 * API keys arrive per request (never persisted, never logged); the connection
 * profile references them by `DRAWVA_CONN_<hash>` and pi-ai resolves the
 * reference through `ctx.credentials` at request time. The record half is
 * intentionally empty: Drawva holds no OAuth grants or stored records.
 */
const values = new Map<string, string>();

export function credentialRefFor(connectionId: string): CredentialRef {
  const hash = createHash("sha256").update(String(connectionId)).digest("hex").slice(0, 12);
  return credentialRef(`DRAWVA_CONN_${hash}`);
}

export function stageConnectionCredential(ref: CredentialRef, apiKey: string): void {
  if (apiKey) values.set(String(ref), apiKey);
}

export function clearConnectionCredential(ref: CredentialRef): void {
  values.delete(String(ref));
}

class DrawvaCredentialProvider extends CredentialProvider {
  constructor(ctx: Context) {
    super(ctx);
  }

  async resolve(ref: CredentialRef) {
    const value = values.get(String(ref));
    if (!value) return undefined;
    return { value, source: "drawva-request" };
  }

  async describe(ref: CredentialRef) {
    const configured = values.has(String(ref));
    return { configured, writable: false as const, ...(configured ? { source: "drawva-request" } : {}) };
  }

  async set(): Promise<void> {
    throw new Error("Drawva credentials are request-scoped and read-only.");
  }

  async unset(): Promise<void> {
    throw new Error("Drawva credentials are request-scoped and read-only.");
  }

  async readRecord(_key: CredentialKey): Promise<CredentialRecord | undefined> {
    // Record half intentionally empty: Drawva holds no stored records.
    return undefined;
  }

  async describeRecord(_key: CredentialKey) {
    return { configured: false, writable: false as const };
  }

  async listRecords(): Promise<readonly { key: CredentialKey; kind: CredentialRecord["kind"] }[]> {
    return [];
  }

  async modifyRecord(
    _key: CredentialKey,
    _mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>
  ): Promise<CredentialRecord | undefined> {
    throw new Error("Drawva holds no credential records.");
  }

  async deleteRecord(_key: CredentialKey): Promise<void> {}
}

export const name = "drawva-credentials";

export function apply(ctx: Context) {
  // The Service base constructor self-registers under 'credentials';
  // a manual ctx.provide would collide with it.
  new DrawvaCredentialProvider(ctx);
}
