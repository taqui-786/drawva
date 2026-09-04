/**
 * Client-execution bridge for canvas tools.
 *
 * The agent loop runs server-side but canvas mutations must execute in the
 * browser. Each tool `execute()` registers a pending call and awaits the
 * client's `tool_result`; `app/api/canvas/agent/tool-result/route.ts` settles
 * it. `(conversationId, toolCallId)` is the idempotency key.
 *
 * The `tool_request` frame is emitted from HERE, not from the session's
 * `tool/call` event. The loop records `tool/call` before the tool's own
 * argument validation runs, so projecting that event let the browser mutate the
 * canvas for a call the runtime then rejected — a phantom mutation the model was
 * told never happened. Dispatching is the first moment the call is real.
 */

export interface BridgeToolCall {
  name: string;
  args: unknown;
  signal: AbortSignal;
}

interface PendingCall {
  call: BridgeToolCall;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

const TOOL_RPC_TIMEOUT_MS = 45_000;

const pending = new Map<string, PendingCall>();

/** Answers that arrived before their dispatch parked (event/registration race). */
const earlyAnswers = new Map<string, { result: unknown; isError: boolean; expires: number }>();
const EARLY_ANSWER_TTL_MS = 60_000;

/** Per-conversation hook that ships a dispatched call to the open turn stream. */
export type BridgeDispatchListener = (call: { toolCallId: string; name: string; args: unknown }) => void;

const dispatchers = new Map<string, BridgeDispatchListener>();

export function setBridgeDispatcher(conversationId: string, listener: BridgeDispatchListener | null): void {
  if (listener) dispatchers.set(conversationId, listener);
  else dispatchers.delete(conversationId);
}

function key(conversationId: string, toolCallId: string): string {
  return `${conversationId}:${toolCallId}`;
}

function takeEarlyAnswer(mapKey: string): { result: unknown; isError: boolean } | null {
  const early = earlyAnswers.get(mapKey);
  if (!early) return null;
  earlyAnswers.delete(mapKey);
  if (Date.now() > early.expires) return null;
  return { result: early.result, isError: early.isError };
}

/** Called by tool `execute()`: parks until the browser answers or 45s elapse. */
export function dispatchBridgeCall(
  conversationId: string,
  toolCallId: string,
  call: BridgeToolCall
): Promise<unknown> {
  const mapKey = key(conversationId, toolCallId);
  const existing = pending.get(mapKey);
  if (existing) {
    // Idempotent replay: a retried dispatch reuses the parked call.
    return new Promise<unknown>((resolve, reject) => {
      const prevResolve = existing.resolve;
      const prevReject = existing.reject;
      existing.resolve = (v) => {
        prevResolve(v);
        resolve(v);
      };
      existing.reject = (e) => {
        prevReject(e);
        reject(e);
      };
    });
  }
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(mapKey);
      reject(new Error(`Canvas tool timed out after ${TOOL_RPC_TIMEOUT_MS / 1000} seconds without a browser answer.`));
    }, TOOL_RPC_TIMEOUT_MS);
    if (call.signal.aborted) {
      clearTimeout(timer);
      reject(call.signal.reason);
      return;
    }
    const onAbort = () => {
      pending.delete(mapKey);
      clearTimeout(timer);
      reject(call.signal.reason);
    };
    call.signal.addEventListener("abort", onAbort, { once: true });
    const early = takeEarlyAnswer(mapKey);
    if (early) {
      call.signal.removeEventListener("abort", onAbort);
      clearTimeout(timer);
      if (early.isError) {
        const message = (early.result as { message?: string } | null)?.message || "Canvas tool failed in the browser.";
        reject(new Error(String(message)));
      } else {
        resolve(early.result);
      }
      return;
    }
    pending.set(mapKey, {
      call,
      resolve: (value) => {
        clearTimeout(timer);
        call.signal.removeEventListener("abort", onAbort);
        pending.delete(mapKey);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        call.signal.removeEventListener("abort", onAbort);
        pending.delete(mapKey);
        reject(err);
      },
      timer,
    });
    // Park first, then ask: a browser fast enough to answer before this returns
    // still finds its pending entry instead of the rendezvous buffer.
    dispatchers.get(conversationId)?.({ toolCallId, name: call.name, args: call.args });
  });
}

export function resolveBridgeCall(conversationId: string, toolCallId: string, result: unknown, isError?: boolean): boolean {
  const entry = pending.get(key(conversationId, toolCallId));
  if (!entry) {
    // The dispatch may not have parked yet; hold the answer for rendezvous.
    if (toolCallId && conversationId) {
      if (earlyAnswers.size > 1000) {
        const now = Date.now();
        for (const [k, v] of earlyAnswers) {
          if (now > v.expires) earlyAnswers.delete(k);
        }
      }
      earlyAnswers.set(key(conversationId, toolCallId), { result, isError: isError === true, expires: Date.now() + EARLY_ANSWER_TTL_MS });
      return true;
    }
    return false;
  }
  if (isError) {
    const message = (result as { message?: string } | null)?.message || "Canvas tool failed in the browser.";
    entry.reject(new Error(String(message)));
  } else {
    entry.resolve(result);
  }
  return true;
}

export function cancelConversationCalls(conversationId: string, reason: unknown): void {
  for (const [mapKey, entry] of [...pending.entries()]) {
    if (mapKey.startsWith(`${conversationId}:`)) {
      entry.reject(reason instanceof Error ? reason : new Error("Conversation ended."));
    }
  }
}
