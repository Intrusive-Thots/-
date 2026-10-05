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
  const linkLabel = isConnected ? 'SSH ONLINE' : 'OFFLINE';
  const linkClass = isConnected
    ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
    : 'bg-rose-950/60 border-rose-800/60 text-rose-400';

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2 gap-2">
          {/* Brand logo & title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Wifi className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-slate-100 tracking-tight">WiFi Pineapple</h1>
                <span className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                  SSH Remote
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate max-w-[9.5rem] sm:max-w-none">
                {config.username}@{config.host}:{config.port}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-2 min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Payload Runner</span>
            </button>

            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center space-x-2 min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'terminal'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>SSH Terminal</span>
            </button>

            <button
              onClick={() => setActiveTab('scheduler')}
              className={`flex items-center space-x-2 min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'scheduler'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <CalendarClock className="w-4 h-4" />
              <span>Scheduler</span>
            </button>

            <button
              onClick={() => setActiveTab('device')}
              className={`flex items-center space-x-2 min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'device'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Device</span>
            </button>
          </nav>

          {/* Right Controls */}
          <div className="flex items-center space-x-3">
            <div className={`flex items-center space-x-1.5 min-h-11 px-3 rounded-xl text-xs font-mono border ${linkClass}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="font-semibold">{linkLabel}</span>
            </div>

            {/* Refresh Stats Button */}
            <button
              onClick={onRefreshStats}
              disabled={isTesting}
              className="min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all border border-slate-800"
              title="Refresh WiFi Pineapple Status"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="min-h-11 min-w-11 px-3 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-all border border-slate-700/60 flex items-center justify-center space-x-1.5"
              title="Configure SSH Credentials & Host"
            >
              <Settings className="w-4 h-4" />
              <span className="text-xs font-medium hidden sm:inline">Config</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden items-stretch gap-1 py-2 border-t border-slate-800/60 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex shrink-0 items-center justify-center space-x-1 min-h-11 px-3 rounded-lg ${
              activeTab === 'dashboard' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Dash</span>
          </button>
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex shrink-0 items-center justify-center space-x-1 min-h-11 px-3 rounded-lg ${
              activeTab === 'editor' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Payloads</span>
          </button>
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex shrink-0 items-center justify-center space-x-1 min-h-11 px-3 rounded-lg ${
              activeTab === 'terminal' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Term</span>
          </button>
          <button
            onClick={() => setActiveTab('scheduler')}
            className={`flex shrink-0 items-center justify-center space-x-1 min-h-11 px-3 rounded-lg ${
              activeTab === 'scheduler' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            <span>Jobs</span>
          </button>
          <button
            onClick={() => setActiveTab('device')}
            className={`flex shrink-0 items-center justify-center space-x-1 min-h-11 px-3 rounded-lg ${
              activeTab === 'device' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Device</span>
          </button>
        </div>
      </div>
    </header>
  );
};
