"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  Server, Cpu, MemoryStick, HardDrive, Globe, Network,
  RefreshCw, Wifi, WifiOff, AlertTriangle, Clock, Key,
  MapPin, Loader2, Activity, Radio, Play, Square, RotateCw
} from 'lucide-react';
import { VmRemoteControl } from '@/components/VmRemoteControl';

interface VM {
  id: string;
  name: string;
  state: string;
  rawState: string;
  operationStatus: string | null;
  availabilityZone: string;
  machineType: string;
  vcpus: number | null;
  ramGb: number | null;
  diskGb: number | null;
  publicIp: string | null;
  privateIp: string | null;
  sshKeyName: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

interface ApiResponse {
  vms: VM[];
  region: string;
  error?: string;
}

// ─── State Configs ─────────────────────────────────────────────────────────────

type StateConfig = { label: string; dot: string; card: string; badge: string; icon: typeof Wifi };

const STATE_CONFIG: Record<string, StateConfig> = {
  running: {
    label: 'Online',
    dot: 'bg-green-500',
    card: 'border-green-500/20 bg-green-500/5',
    badge: 'bg-green-500/10 text-green-400 border border-green-500/20',
    icon: Wifi,
  },
  stopped: {
    label: 'Parada',
    dot: 'bg-neutral-500',
    card: 'border-neutral-700 bg-neutral-900',
    badge: 'bg-neutral-800 text-neutral-400 border border-neutral-700',
    icon: WifiOff,
  },
  suspended: {
    label: 'Suspensa',
    dot: 'bg-yellow-500',
    card: 'border-yellow-500/20 bg-yellow-500/5',
    badge: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    icon: WifiOff,
  },
  error: {
    label: 'Erro',
    dot: 'bg-red-500',
    card: 'border-red-500/30 bg-red-500/5',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    icon: AlertTriangle,
  },
  provisioning: {
    label: 'Provisionando',
    dot: 'bg-blue-500',
    card: 'border-blue-500/20 bg-blue-500/5',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    icon: Activity,
  },
};

const DEFAULT_STATE: StateConfig = {
  label: 'Desconhecido',
  dot: 'bg-neutral-500',
  card: 'border-neutral-700 bg-neutral-900',
  badge: 'bg-neutral-800 text-neutral-400 border border-neutral-700',
  icon: Server,
};

// ─── Stats bar ─────────────────────────────────────────────────────────────────

function StatBadge({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5 bg-neutral-950 rounded-md px-2.5 py-1.5 text-xs text-neutral-300">
      <Icon className="w-3.5 h-3.5 text-neutral-500" />
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

// ─── VM Card ───────────────────────────────────────────────────────────────────

function VMCard({ vm, onControl, onAction }: { vm: VM; onControl: (vm: VM) => void; onAction: (vmId: string, action: 'start' | 'stop' | 'reboot') => void }) {
  const cfg = STATE_CONFIG[vm.state] ?? DEFAULT_STATE;
  const StatusIcon = cfg.icon;
  const isRunning = vm.rawState === 'running';
  const isStopped = vm.rawState === 'stopped';
  const canControl = isRunning && !!vm.publicIp;
  const isBusy = !!vm.operationStatus || vm.rawState === 'provisioning';

  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-4 transition-all ${cfg.card}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Dot indicator */}
          <div className="relative flex-shrink-0 flex h-3 w-3 mt-0.5">
            {isRunning && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${cfg.dot}`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-base leading-tight truncate">{vm.name}</h3>
            <p className="text-xs text-neutral-500 font-mono mt-0.5 truncate">{vm.id}</p>
          </div>
        </div>

        {/* State badge */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
            <StatusIcon className="w-3 h-3" />
            {cfg.label}
          </span>
          {vm.operationStatus && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              <Loader2 className="w-3 h-3 animate-spin" />
              {vm.operationStatus}
            </span>
          )}
        </div>
      </div>

      {/* Hardware badges */}
      <div className="flex flex-wrap gap-2">
        <StatBadge icon={Cpu} label="vCPU" value={vm.vcpus ?? '?'} />
        <StatBadge icon={MemoryStick} label="RAM" value={vm.ramGb ? `${vm.ramGb} GB` : '?'} />
        <StatBadge icon={HardDrive} label="Disco" value={vm.diskGb ? `${vm.diskGb} GB` : '?'} />
        {vm.machineType !== 'N/A' && (
          <StatBadge icon={Server} label="Tipo" value={vm.machineType} />
        )}
      </div>

      {/* Network */}
      <div className="space-y-1.5 text-xs">
        {vm.publicIp && (
          <div className="flex items-center gap-2 text-neutral-300">
            <Globe className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span className="text-neutral-500">IP Público</span>
            <code className="ml-auto font-mono text-purple-300">{vm.publicIp}</code>
          </div>
        )}
        {vm.privateIp && (
          <div className="flex items-center gap-2 text-neutral-300">
            <Network className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span className="text-neutral-500">IP Privado</span>
            <code className="ml-auto font-mono text-neutral-400">{vm.privateIp}</code>
          </div>
        )}
        <div className="flex items-center gap-2 text-neutral-300">
          <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <span className="text-neutral-500">Zona</span>
          <span className="ml-auto font-mono text-neutral-400">{vm.availabilityZone}</span>
        </div>
        {vm.sshKeyName && (
          <div className="flex items-center gap-2 text-neutral-300">
            <Key className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span className="text-neutral-500">SSH Key</span>
            <span className="ml-auto font-mono text-neutral-400 truncate max-w-[140px]">{vm.sshKeyName}</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {vm.error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{vm.error}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-neutral-800 pt-3 mt-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral-600">
            <Clock className="w-3 h-3" />
            <span>
              Atualizado{' '}
              {new Date(vm.updatedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Control button — only visible when VM is running and has a public IP */}
          {canControl && (
            <button
              onClick={() => onControl(vm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600/15 text-purple-400 border border-purple-500/25 hover:bg-purple-600/25 hover:border-purple-500/40 transition-all"
            >
              <Radio className="w-3.5 h-3.5" />
              Controlar
            </button>
          )}
        </div>

        {/* Lifecycle Actions */}
        <div className="flex items-center gap-2 pt-1">
          {isStopped && !isBusy && (
            <button
              onClick={() => onAction(vm.id, 'start')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              Ligar
            </button>
          )}
          {isRunning && !isBusy && (
            <>
              <button
                onClick={() => onAction(vm.id, 'reboot')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Reiniciar
              </button>
              <button
                onClick={() => onAction(vm.id, 'stop')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
              >
                <Square className="w-3.5 h-3.5" />
                Desligar
              </button>
            </>
          )}
          {isBusy && (
            <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 opacity-50 cursor-not-allowed">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Processando...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function VMsPage() {
  const [vms, setVms] = useState<VM[]>([]);
  const [region, setRegion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Remote control state
  const [controlledVm, setControlledVm] = useState<VM | null>(null);

  const fetchVms = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/vms', { cache: 'no-store' });
      const data: ApiResponse = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Erro ao buscar VMs.');
      } else {
        setVms(data.vms);
        setRegion(data.region);
        setLastUpdate(new Date());
      }
    } catch {
      setError('Falha ao conectar com o servidor.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVms();
    // Auto-refresh a cada 60 segundos
    const interval = setInterval(() => fetchVms(), 60_000);
    return () => clearInterval(interval);
  }, [fetchVms]);

  const handleVmAction = async (vmId: string, action: 'start' | 'stop' | 'reboot') => {
    try {
      const res = await fetch(`/api/vms/${vmId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(`Erro ao ${action} VM: ${data.error}`);
        return;
      }

      // Se der certo, marca a VM como ocupada localmente para feedback imediato e refaz a busca
      setVms(prev => prev.map(vm => 
        vm.id === vmId ? { ...vm, operationStatus: 'enviando comando...' } : vm
      ));
      
      // Atualiza depois de 2 segundos para dar tempo do status mudar na MGC
      setTimeout(() => fetchVms(), 2000);
    } catch (err) {
      alert(`Falha ao executar ação ${action}.`);
    }
  };

  // Summary counts
  const counts = vms.reduce(
    (acc, vm) => {
      if (vm.rawState === 'running') acc.online++;
      else if (vm.rawState === 'error') acc.error++;
      else acc.offline++;
      return acc;
    },
    { online: 0, offline: 0, error: 0 }
  );

  return (
    <>
      <div className="max-w-6xl mx-auto">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Máquinas Virtuais</h1>
            <p className="text-neutral-400 mt-1">
              Monitoramento em tempo real via Magalu Cloud
              {region && <span className="ml-2 text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-mono border border-neutral-700">{region}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastUpdate && (
              <span className="text-xs text-neutral-600 hidden sm:block">
                Atualizado {lastUpdate.toLocaleTimeString('pt-BR')}
              </span>
            )}
            <button
              onClick={() => fetchVms(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        {!loading && vms.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{counts.online}</p>
                <p className="text-xs text-neutral-500">Online</p>
              </div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center">
                <WifiOff className="w-5 h-5 text-neutral-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{counts.offline}</p>
                <p className="text-xs text-neutral-500">Paradas</p>
              </div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${counts.error > 0 ? 'bg-red-500/10' : 'bg-neutral-800'}`}>
                <AlertTriangle className={`w-5 h-5 ${counts.error > 0 ? 'text-red-400' : 'text-neutral-600'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${counts.error > 0 ? 'text-red-400' : 'text-white'}`}>{counts.error}</p>
                <p className="text-xs text-neutral-500">Com Erro</p>
              </div>
            </div>
          </div>
        )}

        {/* ── States ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
            <p className="text-neutral-400 text-sm">Buscando VMs na Magalu Cloud...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-16 border border-red-500/20 bg-red-500/5 rounded-xl gap-4">
            <AlertTriangle className="w-10 h-10 text-red-400" />
            <div className="text-center">
              <p className="text-white font-semibold">Erro ao carregar VMs</p>
              <p className="text-neutral-400 text-sm mt-1">{error}</p>
            </div>
            <button
              onClick={() => fetchVms(true)}
              className="mt-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-neutral-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : vms.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 border border-neutral-800 bg-neutral-900/50 rounded-xl gap-4">
            <Server className="w-10 h-10 text-neutral-600" />
            <div className="text-center">
              <p className="text-white font-semibold">Nenhuma VM encontrada</p>
              <p className="text-neutral-400 text-sm mt-1">Nenhuma instância ativa na região {region}.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {vms.map((vm) => (
              <VMCard
                key={vm.id}
                vm={vm}
                onControl={setControlledVm}
                onAction={handleVmAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Remote Control Drawer ── */}
      {controlledVm && controlledVm.publicIp && (
        <VmRemoteControl
          vmName={controlledVm.name}
          vmIp={controlledVm.publicIp}
          onClose={() => setControlledVm(null)}
        />
      )}
    </>
  );
}
