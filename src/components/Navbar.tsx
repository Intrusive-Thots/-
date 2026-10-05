import React from 'react';
import { SSHConfig, PineappleStats } from '../types';
import { Wifi, Terminal, Server, RefreshCw, Settings, Zap, CalendarClock, Package } from 'lucide-react';

interface NavbarProps {
  config: SSHConfig;
  stats: PineappleStats | null;
  isTesting: boolean;
  onOpenSettings: () => void;
  onRefreshStats: () => void;
  activeTab: 'dashboard' | 'editor' | 'terminal' | 'scheduler' | 'device' | 'ai';
  setActiveTab: (tab: 'dashboard' | 'editor' | 'terminal' | 'scheduler' | 'device' | 'ai') => void;
}

const TABS = [
  { id: 'dashboard' as const, label: 'Dash', desktop: 'Dashboard', icon: Server },
  { id: 'editor' as const, label: 'Payloads', desktop: 'Payloads', icon: Zap },
  { id: 'terminal' as const, label: 'Term', desktop: 'Terminal', icon: Terminal },
  { id: 'scheduler' as const, label: 'Jobs', desktop: 'Scheduler', icon: CalendarClock },
  { id: 'device' as const, label: 'Device', desktop: 'Device', icon: Package },
];

export const Navbar: React.FC<NavbarProps> = ({
  config,
  stats,
  isTesting,
  onOpenSettings,
  onRefreshStats,
  activeTab,
  setActiveTab,
}) => {
  const isConnected = Boolean(stats?.connected);
  const linkLabel = isConnected ? 'SSH online' : 'Offline';
  const linkClass = isConnected
    ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
    : 'bg-rose-950/60 border-rose-800/60 text-rose-400';

  return (
    <header className="shrink-0 bg-slate-900 border-b border-slate-800 z-30">
      <div className="px-3 sm:px-6">
        <div className="flex items-center gap-2 min-h-14 py-2">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Wifi className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-slate-100 truncate">PINESSHREMO</h1>
            <p className="text-[11px] text-slate-400 font-mono truncate">
              {config.username}@{config.host}:{config.port}
            </p>
          </div>

          <nav className="hidden lg:flex items-center gap-1 min-w-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium ${
                    active ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.desktop}</span>
                </button>
              );
            })}
          </nav>

          <div
            className={`shrink-0 inline-flex items-center gap-1.5 min-h-11 px-2.5 rounded-xl text-[11px] font-mono border ${linkClass}`}
            title={linkLabel}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="font-semibold">{isConnected ? 'On' : 'Off'}</span>
          </div>
          <button
            type="button"
            onClick={onRefreshStats}
            disabled={isTesting}
            className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-xl border border-slate-800"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin text-amber-400' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700"
            title="Config"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <nav className="grid grid-cols-5 gap-1 pb-2 lg:hidden" aria-label="Screens">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 min-w-0 px-1 rounded-lg flex flex-col items-center justify-center gap-0.5 ${
                  active ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] leading-none truncate max-w-full">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
