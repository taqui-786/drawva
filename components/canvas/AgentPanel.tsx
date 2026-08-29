"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, ImageAdd01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Conductor, ConductorEvent, StepMessage } from "@/lib/ai/conductor";
import { AGENT_MAX_TURN_IMAGES } from "@/lib/ai/agentTools";

interface TranscriptItem {
  id: string;
  role: "user" | "assistant" | "tool" | "status";
  text: string;
  tool?: string;
  ok?: boolean;
  argsSummary?: string;
  summary?: string;
  durationMs?: number;
}

const PANEL_MIN_W = 320;
const PANEL_MAX_W = 560;
const PANEL_WIDTH_KEY = "drawva.agent.panelWidth";

function loadPanelWidth(): number {
  if (typeof window === "undefined") return 380;
  const v = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
  return v >= PANEL_MIN_W && v <= PANEL_MAX_W ? Math.round(v) : 380;
}

export function AgentPanel({
  open,
  conductor,
}: {
  open: boolean;
  conductor: Conductor | null;
}) {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [status, setStatus] = useState("idle");
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [width, setWidth] = useState(loadPanelWidth);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const streamId = useRef<string | null>(null);
  const toolStarted = useRef(0);
  const resizeState = useRef<{ startX: number; startW: number; latest: number } | null>(null);

  useEffect(() => {
    if (!conductor) return;
    setItems(messagesToItems(conductor.getMessages(), nextId));
    const handler = (e: ConductorEvent) => {
      if (e.kind === "turn_start") {
        setRunning(true);
        setStatus("thinking");
        setError(null);
        streamId.current = null;
        setItems(messagesToItems(conductor.getMessages(), nextId));
      } else if (e.kind === "step_start") {
        setStatus("thinking");
      } else if (e.kind === "tool_start") {
        setStatus(e.name);
        toolStarted.current = performance.now();
        pushItem(setItems, nextId, {
          role: "tool",
          text: e.name,
          tool: e.name,
          argsSummary: e.argsSummary,
        });
      } else if (e.kind === "tool_end") {
        const durationMs = Math.max(0, performance.now() - toolStarted.current);
        setItems((prev) => {
          const idx = [...prev].reverse().findIndex((item) => item.role === "tool" && item.tool === e.name && item.ok === undefined);
          if (idx < 0) return prev;
          const at = prev.length - 1 - idx;
          return prev.map((item, i) =>
            i === at ? { ...item, ok: e.ok, summary: e.summary, durationMs } : item
          );
        });
      } else if (e.kind === "text_delta") {
        setStatus("thinking");
        setItems((prev) => {
          if (streamId.current) {
            return prev.map((item) =>
              item.id === streamId.current ? { ...item, text: item.text + e.text } : item
            );
          }
          const id = `m-${nextId.current++}`;
          streamId.current = id;
          return [...prev, { id, role: "assistant", text: e.text }];
        });
      } else if (e.kind === "usage") {
        setTokens((n) => n + e.usage.inputTokens + e.usage.outputTokens);
      } else if (e.kind === "compact") {
        setStatus("compact");
      } else if (e.kind === "turn_end") {
        setRunning(false);
        setStatus(e.reason === "done" ? "idle" : e.reason);
        if (e.reason === "error") {
          const errText = e.error || "Agent failed.";
          setError(errText);
          setItems((prev) => [
            ...prev,
            { id: `err-${nextId.current++}`, role: "assistant", text: `⚠️ ${errText}` },
          ]);
        } else {
          setItems(messagesToItems(conductor.getMessages(), nextId));
        }
        streamId.current = null;
      }
    };
    return conductor.watch(handler);
  }, [conductor]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items, status]);

  if (!open) return null;

  const send = () => {
    const text = draft.trim();
    if (!text || !conductor) return;
    if (running) {
      conductor.steer(text);
      pushItem(setItems, nextId, { role: "user", text: `steer: ${text}` });
      setDraft("");
      return;
    }
    setDraft("");
    const attached = files;
    setFiles([]);
    void conductor.send(text, attached.length ? attached : undefined);
  };

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeState.current = { startX: e.clientX, startW: width, latest: width };
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = resizeState.current;
    if (!s) return;
    const next = Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, s.startW - (e.clientX - s.startX)));
    s.latest = next;
    setWidth(next);
  };
  const onResizeEnd = () => {
    const s = resizeState.current;
    resizeState.current = null;
    if (!s) return;
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(s.latest));
    } catch {}
  };

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 z-40 flex flex-col border-l border-border bg-background/95 shadow-xl backdrop-blur-sm"
      style={{ width: `${width}px`, maxWidth: "100vw" }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent panel"
        className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/30 touch-none"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      />
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">Drawva Agent</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {statusLabel(status, error)}
            {tokens > 0 ? ` · ${tokens} tok` : ""}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            conductor?.reset();
            setItems([]);
            setStatus("idle");
            setError(null);
            setRunning(false);
            setTokens(0);
          }}
        >
          New conversation
        </Button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {items.length === 0 && (
          <p className="text-xs leading-5 text-muted-foreground">
            Multi-step agent. It can scan the canvas, take snapshots, apply commands, patch widgets, and load plugin cards.
          </p>
        )}
        {items.map((item) =>
          item.role === "tool" ? (
            <button
              key={item.id}
              type="button"
              onClick={() => setExpanded((m) => ({ ...m, [item.id]: !m[item.id] }))}
              className="block w-full rounded-md bg-muted/70 px-2.5 py-1.5 text-left font-mono text-[11px] text-muted-foreground"
            >
              <span>
                {item.tool}
                {item.ok === undefined ? "" : item.ok ? " ✓" : " ✗"}
                {item.durationMs !== undefined ? ` ${(item.durationMs / 1000).toFixed(1)}s` : ""}
              </span>
              {expanded[item.id] && (
                <span className="mt-1 block whitespace-pre-wrap text-[10px] opacity-80">
                  {item.argsSummary || ""}
                  {item.summary ? `\n${item.summary}` : ""}
                </span>
              )}
            </button>
          ) : (
            <div
              key={item.id}
              className={cn(
                "rounded-lg px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap",
                item.role === "user" && "ml-6 bg-primary/15",
                item.role === "assistant" && "mr-4 bg-muted"
              )}
            >
              {item.text}
            </div>
          )
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="rounded bg-muted px-1.5 py-0.5">
              {f.name}
            </span>
          ))}
        </div>
      )}

      <div className="border-t border-border p-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={running ? "Steer the current turn…" : "Ask the agent…"}
          className="min-h-16 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const next = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...next].slice(0, AGENT_MAX_TURN_IMAGES));
                e.target.value = "";
              }}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Attach images"
              disabled={running}
              onClick={() => fileRef.current?.click()}
            >
              <HugeiconsIcon icon={ImageAdd01Icon} className="size-4" />
            </Button>
          </div>
          {running ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={send} disabled={!draft.trim()}>
                Steer
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 gap-1 px-3 text-xs"
                onClick={() => conductor?.cancel()}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                Stop
              </Button>
            </div>
          ) : (
            <Button size="sm" className="h-8 gap-1 px-3 text-xs" onClick={send} disabled={!draft.trim()}>
              <HugeiconsIcon icon={SentIcon} className="size-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

function messagesToItems(messages: StepMessage[], nextId: { current: number }): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const idx = m.text.indexOf("\n\n{\"revision\":");
      const text = idx >= 0 ? m.text.slice(0, idx) : m.text;
      items.push({ id: `m-${nextId.current++}`, role: "user", text });
    } else if (m.role === "assistant" && m.text) {
      items.push({ id: `m-${nextId.current++}`, role: "assistant", text: m.text });
    } else if (m.role === "tool") {
      items.push({
        id: `m-${nextId.current++}`,
        role: "tool",
        text: m.name,
        tool: m.name,
        ok: !m.isError,
        summary: typeof m.result === "object" ? JSON.stringify(m.result).slice(0, 240) : String(m.result ?? ""),
      });
    }
  }
  return items;
}

function pushItem(
  setItems: (fn: (prev: TranscriptItem[]) => TranscriptItem[]) => void,
  nextId: { current: number },
  item: Omit<TranscriptItem, "id">
): void {
  setItems((prev) => [...prev, { ...item, id: `m-${nextId.current++}` }]);
}

function statusLabel(status: string, error: string | null): string {
  if (status === "error") return error || "error";
  return status;
}
