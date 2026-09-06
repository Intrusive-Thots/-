import React, { useState } from 'react';
import { SSHConfig } from '../types';
import { Key, Lock, Server, CheckCircle2, AlertCircle, RefreshCw, X, HelpCircle, Shield, Wifi } from 'lucide-react';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SSHConfig;
  onSaveConfig: (newConfig: SSHConfig) => void;
  onTestConnection: (cfg: SSHConfig) => Promise<void>;
  isTesting: boolean;
  testResult: { success?: boolean; message?: string; error?: string; durationMs?: number } | null;
  useSimulation: boolean;
  onToggleSimulation: (val: boolean) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestConnection,
  isTesting,
  testResult,
  useSimulation,
  onToggleSimulation,
}) => {
  const [formData, setFormData] = useState<SSHConfig>(config);
  const [showKeyInput, setShowKeyInput] = useState(config.authType === 'key');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    onClose();
  };

  const handleTest = () => {
    onTestConnection(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">SSH Target Configuration</h2>
              <p className="text-xs text-slate-400">Set WiFi Pineapple SSH IP, credentials, and connection mode</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Target Host & Port */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono flex items-center justify-between">
                <span>WiFi Pineapple IP / Host</span>
                <span className="text-[10px] text-amber-400 font-normal">Default: 172.16.42.1</span>
              </label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="172.16.42.1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono">SSH Port</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                placeholder="22"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Username & Auth Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono">SSH Username</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="root"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono">Authentication Method</label>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, authType: 'password' });
                    setShowKeyInput(false);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formData.authType === 'password'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, authType: 'key' });
                    setShowKeyInput(true);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formData.authType === 'key'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Private Key
                </button>
              </div>
            </div>
          </div>

          {/* Password or Key input */}
          {formData.authType === 'password' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono">Password</label>
              <div className="relative">
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter SSH password (default for root on Pineapple)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 pr-10 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono">SSH Private Key (PEM format)</label>
              <textarea
                value={formData.privateKey || ''}
                onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          )}

          {/* Mode Switcher Banner */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">Execution Mode</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 font-mono">
                  {useSimulation ? 'Simulated Target (Offline)' : 'Hardware SSH Target'}
                </span>
                <input
                  type="checkbox"
                  checked={useSimulation}
                  onChange={(e) => onToggleSimulation(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {useSimulation ? (
                <span>
                  <strong>Simulation Mode Enabled:</strong> Commands and PineAP status will run inside an interactive,
                  realistic hardware emulator. Perfect for testing payloads, writing code, and demonstrating without live hardware connected.
                </span>
              ) : (
                <span>
                  <strong>Hardware Target Mode:</strong> Real SSH calls will be established directly to your WiFi Pineapple IP. Ensure your device is powered on, connected on port 22, and accessible from the server route.
                </span>
              )}
            </p>
          </div>

          {/* Connection Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-mono space-y-1 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                )}
                <span>
                  {testResult.success ? 'SSH Handshake Succeeded' : 'SSH Connection Failed'} ({testResult.durationMs}ms)
                </span>
              </div>
              <p className="text-[11px] opacity-90">{testResult.message || testResult.error}</p>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isTesting ? 'Testing SSH...' : 'Test Connection'}</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
