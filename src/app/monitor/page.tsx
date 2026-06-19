'use client';

import { useEffect, useState } from 'react';
import { Server, Activity, Terminal, Clock, RefreshCw } from 'lucide-react';

interface VMTelemetry {
  vmId: string;
  channel: string;
  status: string;
  lastSeen: string;
  logs: string[];
}

export default function MonitorPage() {
  const [vms, setVms] = useState<Record<string, VMTelemetry>>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/admin/telemetry');
      const data = await res.json();
      setVms(data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Failed to fetch telemetry', e);
    }
  };

  // Poll every 5 seconds
  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  // Uma VM é considerada offline se o último ping foi há mais de 30 segundos
  const isOnline = (lastSeenISO: string) => {
    const diff = Date.now() - new Date(lastSeenISO).getTime();
    return diff < 30000;
  };

  const vmList = Object.values(vms);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <Activity className="w-8 h-8 text-indigo-500" />
              Monitoramento de Instâncias
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Acompanhe o status e os logs das Rádios hospedadas na Magalu Cloud
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-900 px-4 py-2 rounded-lg border border-gray-800">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Última atualização: {lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>

        {vmList.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-400 flex flex-col items-center justify-center">
            <Server className="w-12 h-12 mb-4 text-gray-600" />
            <p>Nenhuma VM detectada ainda.</p>
            <p className="text-sm mt-2">O script da rádio precisa enviar o primeiro pulso de telemetria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {vmList.map((vm) => {
              const online = isOnline(vm.lastSeen);
              
              return (
                <div key={vm.vmId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
                  
                  {/* Header do Card da VM */}
                  <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-3 w-3">
                        {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${online ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      </div>
                      <h3 className="font-bold text-lg">{vm.vmId}</h3>
                      <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 font-mono">
                        {vm.channel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="w-4 h-4" />
                      {new Date(vm.lastSeen).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* Corpo do Terminal (Logs) */}
                  <div className="p-5 flex-1 bg-[#0d1117]">
                    <div className="flex items-center gap-2 mb-3 text-gray-500 text-sm font-semibold uppercase tracking-wider">
                      <Terminal className="w-4 h-4" />
                      Live Console Output
                    </div>
                    
                    <div className="font-mono text-sm space-y-1 h-64 overflow-y-auto custom-scrollbar">
                      {vm.logs.length === 0 ? (
                        <p className="text-gray-600 italic">Aguardando os primeiros logs...</p>
                      ) : (
                        vm.logs.map((log, i) => (
                          <div key={i} className="text-gray-300 break-all leading-relaxed">
                            <span className="text-green-400 mr-2">›</span>
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
