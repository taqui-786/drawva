"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { SyncStatus } from "@/lib/canvas/sync";
import {
  getMyPeerId,
  peerJsIdFor,
  fetchOnlinePeers,
  announcePresence,
  withdrawPresence,
  fetchIncomingRequests,
  fetchOutgoingRequests,
  sendPairingRequest,
  respondToRequest,
  type LobbyPeer,
  type LobbyRequest,
} from "@/lib/canvas/lobby";

export interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SyncStatus;
  roomCode: string | null;
  peerCount: number;
  peerName?: string | null;
  displayName?: string | null;
  errorMessage?: string;
  onHost: () => Promise<string>;
  onJoin: (code: string) => Promise<void>;
  onDisconnect: () => void;
  onGoOnline: (peerJsId: string) => Promise<void>;
  onConnectToPeer: (targetPeerJsId: string, opts: { requestId: string; peerName: string }) => void;
  onAuthorizeRequest: (requestId: string, peerName: string) => void;
}

export function ConnectDialog({
  open,
  onOpenChange,
  status,
  roomCode,
  peerCount,
  peerName,
  displayName,
  errorMessage,
  onHost,
  onJoin,
  onDisconnect,
  onGoOnline,
  onConnectToPeer,
  onAuthorizeRequest,
}: ConnectDialogProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"lobby" | "code">("lobby");
  const [codeTab, setCodeTab] = useState<"host" | "join">("host");
  const [inputCode, setInputCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const joinToastIdRef = useRef<string | number | null>(null);

  const [myPeerId] = useState(() => getMyPeerId());
  const myPeerJsId = peerJsIdFor(myPeerId);
  const [lobbyOnline, setLobbyOnline] = useState(false);
  const [goingOnline, setGoingOnline] = useState(false);
  const [peers, setPeers] = useState<LobbyPeer[]>([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [incoming, setIncoming] = useState<LobbyRequest[]>([]);
  const [outgoing, setOutgoing] = useState<LobbyRequest[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dialedRef = useRef<Set<string>>(new Set());
  const toastedIncomingRef = useRef<Set<string>>(new Set());
  const awaitingLinkRef = useRef<{ name: string } | null>(null);
  const linkingToastRef = useRef<string | number | null>(null);

  const refreshPeers = useCallback(async () => {
    setPeersLoading(true);
    try {
      setPeers(await fetchOnlinePeers(myPeerId));
    } finally {
      setPeersLoading(false);
    }
  }, [myPeerId]);

  const refreshIncoming = useCallback(async () => {
    try {
      return await fetchIncomingRequests(myPeerId);
    } catch {
      return [];
    }
  }, [myPeerId]);

  const refreshOutgoing = useCallback(async () => {
    try {
      return await fetchOutgoingRequests(myPeerId);
    } catch {
      return [];
    }
  }, [myPeerId]);

  useEffect(() => {
    if (!lobbyOnline) return;
    const beat = setInterval(() => {
      void announcePresence(myPeerId, myPeerJsId);
    }, 20000);
    const withdraw = () => withdrawPresence(myPeerId);
    window.addEventListener("beforeunload", withdraw);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener("beforeunload", withdraw);
    };
  }, [lobbyOnline, myPeerId, myPeerJsId]);

  useEffect(() => {
    if (!lobbyOnline || !open || tab !== "lobby") return;
    let cancelled = false;
    const load = () => {
      fetchOnlinePeers(myPeerId)
        .then((list) => {
          if (!cancelled) setPeers(list);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lobbyOnline, open, tab, myPeerId]);

  useEffect(() => {
    if (!lobbyOnline) return;
    let cancelled = false;
    const poll = async () => {
      const list = await refreshIncoming();
      if (cancelled) return;
      setIncoming(list);
      for (const req of list) {
        if (!toastedIncomingRef.current.has(req.id)) {
          toastedIncomingRef.current.add(req.id);
          if (!open) {
            toast(`${req.fromName} wants to connect`, {
              description: "Open Live P2P Sync to accept or decline.",
              action: {
                label: "Review",
                onClick: () => {
                  setTab("lobby");
                  onOpenChange(true);
                },
              },
              duration: 15000,
            });
          }
        }
      }
    };
    void poll();
    const id = setInterval(() => {
      void poll();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lobbyOnline, open, refreshIncoming, onOpenChange]);

  const hasPendingOutgoing = outgoing.some((r) => r.status === "pending");
  useEffect(() => {
    if (!lobbyOnline || (!hasPendingOutgoing && !awaitingLinkRef.current)) return;
    let cancelled = false;
    const poll = async () => {
      const list = await refreshOutgoing();
      if (cancelled) return;
      setOutgoing(list.filter((r) => !dismissed.has(r.id)));
      for (const req of list) {
        if (req.status === "accepted" && !dialedRef.current.has(req.id)) {
          dialedRef.current.add(req.id);
          awaitingLinkRef.current = { name: req.toName };
          linkingToastRef.current = toast.loading(`Linking to ${req.toName}…`);
          onConnectToPeer(req.toPeerJsId, { requestId: req.id, peerName: req.toName });
        } else if (req.status === "rejected" && !dismissed.has(req.id)) {
          setDismissed((prev) => new Set(prev).add(req.id));
          toast.info(`${req.toName} declined your request`);
        }
      }
    };
    void poll();
    const id = setInterval(() => {
      void poll();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lobbyOnline, hasPendingOutgoing, refreshOutgoing, dismissed, onConnectToPeer]);

  const dismissLinkingToast = () => {
    if (linkingToastRef.current) {
      toast.dismiss(linkingToastRef.current);
      linkingToastRef.current = null;
    }
  };
  useEffect(() => {
    if (awaitingLinkRef.current && status === "connected") {
      const name = awaitingLinkRef.current.name;
      awaitingLinkRef.current = null;
      dismissLinkingToast();
      toast.success(`Connected to ${name}!`);
      onOpenChange(false);
    } else if (awaitingLinkRef.current && status === "error") {
      awaitingLinkRef.current = null;
      dismissLinkingToast();
      toast.error(errorMessage || "Failed to link to device");
    }
  }, [status, errorMessage, onOpenChange]);

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

  const isJoining = status === "connecting" || (loading && codeTab === "join");

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
    if (linkingToastRef.current) {
      toast.dismiss(linkingToastRef.current);
      linkingToastRef.current = null;
    }
    awaitingLinkRef.current = null;
    setLoading(false);
    if (lobbyOnline) {
      withdrawPresence(myPeerId);
      setLobbyOnline(false);
      setPeers([]);
      setIncoming([]);
      setOutgoing([]);
    }
    onDisconnect();
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    void navigator.clipboard.writeText(roomCode);
    setCopied(true);
    toast.success("Connect code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoOnline = async () => {
    setGoingOnline(true);
    try {
      await onGoOnline(myPeerJsId);
      const ok = await announcePresence(myPeerId, myPeerJsId);
      if (!ok) throw new Error("Could not register in the lobby");
      setLobbyOnline(true);
      toast.success("You're online — others can find you now");
      void refreshPeers();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "Failed to go online";
      toast.error(msg);
    } finally {
      setGoingOnline(false);
    }
  };

  const handleGoOffline = () => {
    withdrawPresence(myPeerId);
    setLobbyOnline(false);
    setPeers([]);
    setIncoming([]);
    setOutgoing([]);
    onDisconnect();
  };

  const handleConnect = async (peer: LobbyPeer) => {
    setSendingTo(peer.peerId);
    try {
      const res = await sendPairingRequest(myPeerId, myPeerJsId, peer.peerId);
      if (res.ok) {
        toast.success(`Request sent to ${peer.displayName}`, {
          description: "You'll link up automatically once they accept.",
        });
        const list = await refreshOutgoing();
        setOutgoing(list);
      } else {
        toast.error(res.error || "Failed to send request");
      }
    } finally {
      setSendingTo(null);
    }
  };

  const handleAccept = async (req: LobbyRequest) => {
    setAnswering(req.id);
    try {
      onAuthorizeRequest(req.id, req.fromName);
      const res = await respondToRequest(req.id, myPeerId, "accept");
      if (res.ok) {
        toast.success(`Accepted ${req.fromName} — they're linking now…`);
        setIncoming((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        toast.error(res.error || "Failed to accept request");
      }
    } finally {
      setAnswering(null);
    }
  };

  const handleReject = async (req: LobbyRequest) => {
    setAnswering(req.id);
    try {
      const res = await respondToRequest(req.id, myPeerId, "reject");
      if (res.ok) {
        toast.info(`Declined ${req.fromName}'s request`);
        setIncoming((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        toast.error(res.error || "Failed to decline request");
      }
    } finally {
      setAnswering(null);
    }
  };

  const handleCancelOutgoing = async (req: LobbyRequest) => {
    try {
      await respondToRequest(req.id, myPeerId, "cancel");
      setOutgoing((prev) => prev.filter((r) => r.id !== req.id));
    } catch {
      toast.error("Failed to cancel request");
    }
  };

  const isConnected = status === "connected";
  const isHosting = status === "hosting";
  const isConnecting = status === "connecting";
  const pendingOutgoing = outgoing.filter((r) => r.status === "pending");

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

        {(isConnected || isHosting || isConnecting) && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Badge variant="default" className="gap-1">
                  <HugeiconsIcon icon={Wifi01Icon} className="size-3.5" />
                  {roomCode ? "Connected P2P" : `Linked${peerName ? ` · ${peerName}` : ""}`}
                </Badge>
              ) : isHosting ? (
                <Badge variant="outline" className="gap-1 ">
                  <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                  {roomCode ? "Hosting Session" : lobbyOnline ? `Online · ${displayName}` : "Hosting Session"}
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

        <div className="flex rounded-lg border bg-muted p-1 text-xs">
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              tab === "lobby"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("lobby")}
          >
            People Nearby
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              tab === "code"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("code")}
          >
            Room Code
          </button>
        </div>

        {tab === "lobby" && (
          <div className="flex flex-col gap-3 py-1">
            {!displayName ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center">
                <p className="text-sm font-medium">Sign in to see who&apos;s online</p>
                <p className="text-xs text-muted-foreground">
                  The lobby lists signed-in users so connection requests reach the right person.
                </p>
                <Button size="sm" onClick={() => router.push("/signin")}>
                  Sign in
                </Button>
              </div>
            ) : !lobbyOnline ? (
              <div className="flex flex-col gap-2 text-center">
                <p className="text-xs text-muted-foreground">
                  Open your connection to appear in the lobby as{" "}
                  <span className="font-semibold text-foreground">{displayName}</span>.
                  Others can then send you a connect request — nothing links without your accept.
                </p>
                <Button onClick={handleGoOnline} disabled={goingOnline} className="gap-2">
                  {goingOnline ? (
                    <HugeiconsIcon icon={Loading02Icon} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={Wifi01Icon} />
                  )}
                  {goingOnline ? "Opening…" : "Open Connection"}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Online as <span className="font-semibold text-foreground">{displayName}</span>
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleGoOffline}>
                    Go offline
                  </Button>
                </div>

                {incoming.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium">Connection requests</p>
                    {incoming.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{req.fromName}</span>
                          <span className="text-[11px] text-muted-foreground">wants to connect to you</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={answering === req.id}
                            onClick={() => handleAccept(req)}
                          >
                            <HugeiconsIcon icon={Tick01Icon} className="size-3.5" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={answering === req.id}
                            onClick={() => handleReject(req)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pendingOutgoing.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium">Waiting for accept</p>
                    {pendingOutgoing.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin text-muted-foreground" />
                          <span className="truncate text-sm">{req.toName}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleCancelOutgoing(req)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">
                      Online now {peers.length > 0 && <span className="text-muted-foreground">({peers.length})</span>}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={refreshPeers}
                      disabled={peersLoading}
                    >
                      <HugeiconsIcon icon={Refresh01Icon} className={`size-3.5 ${peersLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                  {peers.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No one else is online right now. Ask them to open Drawva and tap “Open Connection”.
                    </p>
                  ) : (
                    <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                      {peers.map((peer) => {
                        const waiting = pendingOutgoing.some((r) => r.toPeerId === peer.peerId);
                        return (
                          <div
                            key={peer.peerId}
                            className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                              <span className="truncate text-sm font-medium">{peer.displayName}</span>
                            </div>
                            <Button
                              size="sm"
                              variant={waiting ? "secondary" : "outline"}
                              className="h-7 shrink-0 gap-1 text-xs"
                              disabled={waiting || sendingTo === peer.peerId}
                              onClick={() => handleConnect(peer)}
                            >
                              {sendingTo === peer.peerId ? (
                                <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                              ) : (
                                <HugeiconsIcon icon={Wifi01Icon} className="size-3.5" />
                              )}
                              {waiting ? "Requested" : "Connect"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "code" && (
          <div className="flex flex-col gap-2 py-1">
            <div className="flex rounded-lg border bg-muted p-1 text-xs">
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  codeTab === "host"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setCodeTab("host")}
              >
                Generate Code (Host)
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  codeTab === "join"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setCodeTab("join")}
              >
                Enter Code (Join)
              </button>
            </div>

            {codeTab === "host" && (
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

            {codeTab === "join" && (
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
