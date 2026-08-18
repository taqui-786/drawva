"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick01Icon,
  Wifi01Icon,
  Loading02Icon,
  PeerToPeer01Icon,
  QrCodeIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { SyncStatus } from "@/lib/canvas/sync";

export interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SyncStatus;
  roomCode: string | null;
  peerCount: number;
  errorMessage?: string;
  onHost: () => Promise<string>;
  onJoin: (code: string) => Promise<void>;
  onDisconnect: () => void;
}

export function ConnectDialog({
  open,
  onOpenChange,
  status,
  roomCode,
  peerCount,
  errorMessage,
  onHost,
  onJoin,
  onDisconnect,
}: ConnectDialogProps) {
  const [tab, setTab] = useState<"host" | "join">("host");
  const [inputCode, setInputCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const joinToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!joinToastIdRef.current) return;

    if (status === "connected") {
      toast.success("Connected to session!", { id: joinToastIdRef.current });
      joinToastIdRef.current = null;
      onOpenChange(false);
    } else if (status === "error") {
      toast.error(errorMessage || "Failed to connect to session", { id: joinToastIdRef.current });
      joinToastIdRef.current = null;
    }
  }, [status, errorMessage, onOpenChange]);

  const isJoining = status === "connecting" || (loading && tab === "join");

  const handleHost = async () => {
    setLoading(true);
    try {
      const code = await onHost();
      toast.success(`Session started! Code: ${code}`);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "Failed to host session";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inputCode.trim()) {
      toast.error("Please enter a 6-digit connect code");
      return;
    }
    const toastId = toast.loading("Connecting to session…");
    joinToastIdRef.current = toastId;
    setLoading(true);

    try {
      await onJoin(inputCode);
      if (status === "connected" && joinToastIdRef.current === toastId) {
        toast.success("Connected to session!", { id: toastId });
        joinToastIdRef.current = null;
        onOpenChange(false);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "Failed to join session";
      toast.error(msg, { id: toastId });
      joinToastIdRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    if (joinToastIdRef.current) {
      toast.dismiss(joinToastIdRef.current);
      joinToastIdRef.current = null;
    }
    setLoading(false);
    onDisconnect();
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    void navigator.clipboard.writeText(roomCode);
    setCopied(true);
    toast.success("Connect code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const isConnected = status === "connected";
  const isHosting = status === "hosting";
  const isConnecting = status === "connecting";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <HugeiconsIcon icon={PeerToPeer01Icon} className="size-5 text-primary" />
            Live Device Connection
          </DialogTitle>
          <DialogDescription>
            Connect Drawva across phones, tablets, or laptops in real-time. Zero cloud storage or database required.
          </DialogDescription>
        </DialogHeader>

        {/* Current Active Status Banner */}
        {(isConnected || isHosting || isConnecting) && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Badge variant="default" className="gap-1">
                  <HugeiconsIcon icon={Wifi01Icon} className="size-3.5" />
                  Connected P2P
                </Badge>
              ) : isHosting ? (
                <Badge variant="outline" className="gap-1 ">
                  <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                  Hosting Session
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                  Connecting…
                </Badge>
              )}

              {roomCode && (
                <span className="font-mono font-bold tracking-wider text-foreground">
                  {roomCode}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {peerCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {peerCount} device{peerCount > 1 ? "s" : ""} linked
                </span>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        {/* Mode Tabs */}
        <div className="flex rounded-lg border bg-muted p-1 text-xs">
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              tab === "host"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("host")}
          >
            Generate Code (Host)
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              tab === "join"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("join")}
          >
            Enter Code (Join)
          </button>
        </div>

        {/* Host Tab Content */}
        {tab === "host" && (
          <div className="flex flex-col gap-3 py-2">
            {!roomCode ? (
              <div className="flex flex-col gap-2 text-center">
                <p className="text-xs text-muted-foreground">
                  Generate a 6-digit connect code to invite another device to share this canvas.
                </p>
                <Button onClick={handleHost} disabled={loading} className="gap-2">
                  {loading ? (
                    <HugeiconsIcon icon={Loading02Icon} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={QrCodeIcon} />
                  )}
                  Generate Connect Code
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center">
                  <span className="text-xs text-muted-foreground">Your Session Code</span>
                  <span className="font-mono text-3xl font-extrabold tracking-widest text-primary my-1">
                    {roomCode}
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Enter this code on the other device to connect instantly.
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={handleCopyCode}
                  className="w-full gap-2"
                >
                  <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} />
                  {copied ? "Copied!" : "Copy Code"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Join Tab Content */}
        {tab === "join" && (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Enter Friend&apos;s Connect Code
              </label>
              <Input
                placeholder="e.g. 849201"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="font-mono text-center text-lg uppercase tracking-wider"
              />
            </div>
            <Button
              onClick={handleJoin}
              disabled={isJoining || !inputCode.trim()}
              className="gap-2"
            >
              {isJoining ? (
                <HugeiconsIcon icon={Loading02Icon} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={Wifi01Icon} />
              )}
              Connect to Device
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
