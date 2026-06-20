"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  SkipForward,
  Play,
  Pause,
  Volume2,
  Radio,
  Music2,
  GripVertical,
  Loader2,
  WifiOff,
  AlertTriangle,
  ListMusic,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// ─── Types (mirroring project/server/types.ts) ────────────────────────────────

interface TrackMetadata {
  artist?: string;
  genre?: string;
  source?: string;
  song_name?: string;
  author?: string;
  provider?: string;
  watch_url?: string;
  download_stream_url?: string;
  album_image?: string;
}

interface TrackInfo {
  id: string;
  filename: string;
  path: string;
  s3_audio_url?: string;
  s3_video_url?: string;
  metadata?: TrackMetadata;
}

type StreamStatus = "idle" | "streaming" | "paused" | "reconnecting" | "offline" | "compliance_blocked";

interface AuraStreamState {
  status: StreamStatus;
  currentTrack: TrackInfo | null;
  queue: TrackInfo[];
  shutdownAt?: number | null;
}

type WsConnectionState = "connecting" | "connected" | "disconnected" | "error";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trackDisplayName(track: TrackInfo): string {
  return (
    track.metadata?.song_name ||
    track.metadata?.author ||
    track.filename?.replace(/\.mp3$/i, "") ||
    track.id
  );
}

function trackArtist(track: TrackInfo): string {
  return track.metadata?.artist || track.metadata?.author || "Artista desconhecido";
}

const STATUS_LABEL: Record<StreamStatus, string> = {
  idle: "Parado",
  streaming: "Ao vivo",
  paused: "Pausado",
  reconnecting: "Reconectando...",
  offline: "Offline",
  compliance_blocked: "Bloqueado",
};

// ─── Draggable track row ──────────────────────────────────────────────────────

function TrackRow({
  track,
  index,
  isCurrent,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  track: TrackInfo;
  index: number;
  isCurrent: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${
        isCurrent
          ? "bg-purple-600/20 border border-purple-500/30"
          : "bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-800/60"
      }`}
    >
      {/* Index / grip */}
      <div className="flex-shrink-0 w-6 flex items-center justify-center">
        {isCurrent ? (
          <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
        ) : (
          <span className="text-xs text-neutral-600 font-mono">{index + 1}</span>
        )}
      </div>

      {/* Album art placeholder */}
      <div className="flex-shrink-0 w-9 h-9 rounded-md overflow-hidden bg-neutral-800 flex items-center justify-center">
        {track.metadata?.album_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.metadata.album_image} alt="" className="w-full h-full object-cover" />
        ) : (
          <Music2 className="w-4 h-4 text-neutral-600" />
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold truncate ${
            isCurrent ? "text-purple-300" : "text-white"
          }`}
        >
          {trackDisplayName(track)}
        </p>
        <p className="text-xs text-neutral-500 truncate">{trackArtist(track)}</p>
      </div>

      {/* Reorder buttons */}
      {!isCurrent && (
        <div className="flex-shrink-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 rounded text-neutral-500 hover:text-white hover:bg-neutral-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Mover para cima"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 rounded text-neutral-500 hover:text-white hover:bg-neutral-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Mover para baixo"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface VmRemoteControlProps {
  vmName: string;
  vmIp: string;
  onClose: () => void;
}

export function VmRemoteControl({ vmName, vmIp, onClose }: VmRemoteControlProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wsState, setWsState] = useState<WsConnectionState>("connecting");
  const [streamState, setStreamState] = useState<AuraStreamState | null>(null);
  const [volume, setVolume] = useState(1);
  const [queue, setQueue] = useState<TrackInfo[]>([]);

  const WS_URL = `ws://${vmIp}:9003`;

  // ── Send helper ──────────────────────────────────────────────────────────────
  const send = useCallback((event: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }));
    }
  }, []);

  // ── WebSocket connection ──────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    setWsState("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState("connected");
      ws.send(JSON.stringify({ event: "queue:view" }));
    };

    ws.onmessage = (e) => {
      try {
        const { event, payload } = JSON.parse(e.data);
        if (event === "server:state_sync") {
          const s = payload as AuraStreamState;
          setStreamState(s);
          setQueue(s.queue || []);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      setWsState("disconnected");
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      setWsState("error");
      ws.close();
    };
  }, [WS_URL]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Media controls ────────────────────────────────────────────────────────────
  const handleSkip = () => send("media:skip");

  const handleTogglePlay = () => {
    if (!streamState) return;
    if (streamState.status === "streaming") {
      send("media:pause");
    } else {
      send("media:play");
    }
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    send("media:volume", v);
  };

  // ── Queue reorder ─────────────────────────────────────────────────────────────
  const moveTrack = (fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= queue.length) return;

    const newQueue = [...queue];
    [newQueue[fromIndex], newQueue[toIndex]] = [newQueue[toIndex], newQueue[fromIndex]];
    setQueue(newQueue);
    send("queue:reorder", { newOrder: newQueue.map((t) => t.id) });
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const isStreaming = streamState?.status === "streaming";
  const isPaused = streamState?.status === "paused";
  const currentTrack = streamState?.currentTrack;

  const statusDot =
    isStreaming
      ? "bg-green-500"
      : isPaused
      ? "bg-yellow-500"
      : streamState?.status === "reconnecting"
      ? "bg-blue-500"
      : "bg-neutral-500";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed right-0 top-0 h-screen w-full max-w-md bg-neutral-950 border-l border-neutral-800 shadow-2xl z-50 flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              {isStreaming && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusDot}`} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">{vmName}</p>
              <p className="text-xs text-neutral-500 font-mono">{vmIp}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Connection state ── */}
        {wsState !== "connected" && (
          <div className="px-5 py-3 flex items-center gap-2 border-b border-neutral-800 shrink-0">
            {wsState === "connecting" ? (
              <>
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-xs text-blue-400">Conectando ao WebSocket da VM...</span>
              </>
            ) : wsState === "disconnected" ? (
              <>
                <WifiOff className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-yellow-400">Reconectando em 5s...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-400">Falha ao conectar. Verifique se a VM está acessível na porta 9003.</span>
              </>
            )}
          </div>
        )}

        {/* ── Now Playing ── */}
        <div className="px-5 py-5 border-b border-neutral-800 shrink-0">
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-3">
            Tocando agora
          </p>

          {currentTrack ? (
            <div className="flex items-center gap-4">
              {/* Album art */}
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-800 flex-shrink-0 flex items-center justify-center">
                {currentTrack.metadata?.album_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentTrack.metadata.album_image}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music2 className="w-8 h-8 text-neutral-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base truncate">
                  {trackDisplayName(currentTrack)}
                </p>
                <p className="text-sm text-neutral-400 truncate">{trackArtist(currentTrack)}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isStreaming
                        ? "bg-green-500/15 text-green-400 border border-green-500/25"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                    }`}
                  >
                    {isStreaming && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    )}
                    {STATUS_LABEL[streamState?.status ?? "idle"]}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-neutral-500">
              <Music2 className="w-8 h-8" />
              <p className="text-sm">
                {wsState === "connected" ? "Nenhuma música tocando" : "Aguardando conexão..."}
              </p>
            </div>
          )}
        </div>

        {/* ── Transport Controls ── */}
        <div className="px-5 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center justify-between gap-4">
            {/* Play/Pause */}
            <button
              onClick={handleTogglePlay}
              disabled={wsState !== "connected"}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isStreaming
                  ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/25"
                  : "bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25"
              }`}
            >
              {isStreaming ? (
                <>
                  <Pause className="w-4 h-4" /> Pausar
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Tocar
                </>
              )}
            </button>

            {/* Skip */}
            <button
              onClick={handleSkip}
              disabled={wsState !== "connected"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward className="w-4 h-4" />
              Pular
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 mt-4">
            <Volume2 className="w-4 h-4 text-neutral-500 flex-shrink-0" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              disabled={wsState !== "connected"}
              onChange={(e) => handleVolume(parseFloat(e.target.value))}
              className="flex-1 accent-purple-500 disabled:opacity-40"
            />
            <span className="text-xs text-neutral-500 w-8 text-right font-mono">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {/* ── Queue ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-neutral-800 shrink-0 flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-neutral-500" />
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">
              Fila de reprodução
            </p>
            <span className="ml-auto text-xs text-neutral-600 font-mono">
              {queue.length} músicas
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
            {wsState !== "connected" && queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-2 py-12">
                <ListMusic className="w-8 h-8" />
                <p className="text-sm">Aguardando sincronização...</p>
              </div>
            ) : queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-2 py-12">
                <ListMusic className="w-8 h-8" />
                <p className="text-sm">Fila vazia</p>
              </div>
            ) : (
              queue.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  isCurrent={track.id === currentTrack?.id}
                  onMoveUp={() => moveTrack(index, "up")}
                  onMoveDown={() => moveTrack(index, "down")}
                  isFirst={index === 0}
                  isLast={index === queue.length - 1}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
