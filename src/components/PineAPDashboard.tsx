import React from 'react';
import { PineappleStats, SSHConfig } from '../types';
import {
  Wifi,
  Cpu,
  HardDrive,
  Activity,
  Play,
  Square,
  RefreshCw,
  Radio,
  Terminal,
  Shield,
  Layers,
  Zap,
  Sliders,
} from 'lucide-react';
import { SystemMetricsWidget } from './SystemMetricsWidget';

interface PineAPDashboardProps {
  stats: PineappleStats | null;
  config: SSHConfig;
  useSimulation?: boolean;
  onExecuteQuickCommand: (cmd: string) => void;
  isExecuting: boolean;
  onOpenEditor: () => void;
  onOpenTerminal: () => void;
}

export const PineAPDashboard: React.FC<PineAPDashboardProps> = ({
  stats,
  config,
  useSimulation = false,
  onExecuteQuickCommand,
  isExecuting,
  onOpenEditor,
  onOpenTerminal,
}) => {
  const connected = stats?.connected;

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero status */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Wifi className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                  <span>{stats?.model || 'WiFi Pineapple Mark VII'}</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-amber-300 rounded border border-slate-700">
                    {stats?.firmwareVersion || 'Firmware v2.1.2'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  SSH Endpoint: {config.username}@{config.host}:{config.port}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Triggers */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenEditor}
              className="flex items-center space-x-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg"
            >
              <Zap className="w-4 h-4" />
              <span>Payload Runner</span>
            </button>
            <button
              onClick={onOpenTerminal}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs border border-slate-700 transition-colors"
            >
              <Terminal className="w-4 h-4 text-amber-400" />
              <span>Live Terminal</span>
            </button>
          </div>
        </div>

        {/* Quick System Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Uptime</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1">
              {stats?.uptime || '4h 12m'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>CPU Load</span>
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1">
              {stats?.cpuLoad || '0.18 (Normal)'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Memory (RAM)</span>
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1">
              {stats?.memoryUsage || '118MB / 256MB'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Storage / SD Card</span>
              <HardDrive className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1">
              {stats?.storageUsage || '27.7GB Free'}
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated D3 Real-Time CPU & Memory Telemetry Widget */}
      <SystemMetricsWidget
        config={config}
        useSimulation={useSimulation}
        onExecuteCommand={onExecuteQuickCommand}
      />

      {/* PineAP Suite Controller & Wireless Interfaces Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PineAP Suite Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">PineAP Suite Control</h3>
                <p className="text-xs text-slate-400">Manage beacon broadcasting, karma, and target pools</p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 text-xs font-mono font-bold rounded-full border ${
                stats?.pineapStatus.enabled
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800/80'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {stats?.pineapStatus.enabled ? 'PINEAP ACTIVE' : 'PINEAP STOPPED'}
            </span>
          </div>

          {/* Quick PineAP Toggle Controls */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onExecuteQuickCommand('pineap enable && pineap start && pineap get_status')}
              disabled={isExecuting}
              className="flex items-center justify-center space-x-2 p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start PineAP Suite</span>
            </button>

            <button
              onClick={() => onExecuteQuickCommand('pineap disable && pineap get_status')}
              disabled={isExecuting}
              className="flex items-center justify-center space-x-2 p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop PineAP Suite</span>
            </button>
          </div>

          {/* PineAP Status Grid */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">Karma Engine:</span>
              <span className="text-amber-400 font-bold">
                {stats?.pineapStatus.karma ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">AP Pool Broadcasting:</span>
              <span className="text-emerald-400 font-bold">
                {stats?.pineapStatus.apPool ? 'ENABLED (42 SSIDs)' : 'DISABLED'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">Recon Engine:</span>
              <span className="text-slate-200">
                {stats?.pineapStatus.reconActive ? 'Scanning on wlan1mon' : 'Idle'}
              </span>
            </div>
          </div>
        </div>

        {/* Wireless Interfaces Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Wireless Interfaces</h3>
                <p className="text-xs text-slate-400 font-mono">wlan0 / wlan1mon / wlan2 status</p>
              </div>
            </div>

            <button
              onClick={() => onExecuteQuickCommand('ifconfig; iwconfig')}
              disabled={isExecuting}
              className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-xl transition-colors border border-slate-700"
              title="Refresh interfaces"
            >
              <RefreshCw className={`w-4 h-4 ${isExecuting ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3">
            {(stats?.interfaces || [
              { name: 'wlan0', type: 'Access Point', mac: '00:13:37:A4:B2:11', state: 'up', ip: '172.16.42.1' },
              { name: 'wlan1mon', type: 'Monitor Mode', mac: '00:13:37:A4:B2:12', state: 'monitor' },
              { name: 'wlan2', type: 'Out-of-Band Client', mac: '00:13:37:A4:B2:13', state: 'down' },
            ]).map((iface) => (
              <div
                key={iface.name}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-amber-400 text-sm">{iface.name}</span>
                    <span className="text-[10px] text-slate-400 font-sans">({iface.type})</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    MAC: {iface.mac} {iface.ip ? `| IP: ${iface.ip}` : ''}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                      iface.state === 'up'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : iface.state === 'monitor'
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {iface.state}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Interface Utilities */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onExecuteQuickCommand('airmon-ng start wlan1 && ifconfig')}
              disabled={isExecuting}
              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono border border-slate-700 transition-colors text-center"
            >
              Start Monitor Mode
            </button>

            <button
              onClick={() => onExecuteQuickCommand('ifconfig wlan1 down && macchanger -r wlan1 && ifconfig wlan1 up')}
              disabled={isExecuting}
              className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono border border-slate-700 transition-colors text-center"
            >
              Randomize MAC
            </button>
          </div>
        </div>
      </div>

      {/* Quick SSH One-Click Shell Snippets */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
        <div className="flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-slate-100">Quick SSH One-Click Triggers</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <button
            onClick={() => onExecuteQuickCommand('uptime')}
            disabled={isExecuting}
            className="p-3 bg-slate-950 hover:bg-slate-800/80 text-slate-300 rounded-xl border border-slate-800 font-mono text-left transition-colors"
          >
            <div className="font-bold text-amber-400">uptime</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Check load & uptime</div>
          </button>

          <button
            onClick={() => onExecuteQuickCommand('logread | tail -n 20')}
            disabled={isExecuting}
            className="p-3 bg-slate-950 hover:bg-slate-800/80 text-slate-300 rounded-xl border border-slate-800 font-mono text-left transition-colors"
          >
            <div className="font-bold text-amber-400">logread | tail</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Tail system log</div>
          </button>

          <button
            onClick={() => onExecuteQuickCommand('uci show wireless')}
            disabled={isExecuting}
            className="p-3 bg-slate-950 hover:bg-slate-800/80 text-slate-300 rounded-xl border border-slate-800 font-mono text-left transition-colors"
          >
            <div className="font-bold text-amber-400">uci show wireless</div>
            <div className="text-[10px] text-slate-500 mt-0.5">View OpenWrt Wi-Fi config</div>
          </button>

          <button
            onClick={() => onExecuteQuickCommand('df -h')}
            disabled={isExecuting}
            className="p-3 bg-slate-950 hover:bg-slate-800/80 text-slate-300 rounded-xl border border-slate-800 font-mono text-left transition-colors"
          >
            <div className="font-bold text-amber-400">df -h</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Check SD card space</div>
          </button>
        </div>
      </div>
    </div>
  );
};
