import React, { useEffect, useRef, useState } from 'react';
import { SSHConfig } from '../types';
import { Lock, Server, CheckCircle2, AlertCircle, RefreshCw, X, Shield } from 'lucide-react';
import { readHostPin } from '../utils/hostPin';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SSHConfig;
  onSaveConfig: (newConfig: SSHConfig) => void;
  onTestConnection: (cfg: SSHConfig) => Promise<void>;
  isTesting: boolean;
  testResult: { success?: boolean; message?: string; error?: string; durationMs?: number } | null;
  onForgetHostPin: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestConnection,
  isTesting,
  testResult,
  onForgetHostPin,
}) => {
  const [formData, setFormData] = useState<SSHConfig>(config);
  const [showKeyInput, setShowKeyInput] = useState(config.authType === 'key');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setFormData(config);
      setShowKeyInput(config.authType === 'key');
    }
    wasOpen.current = isOpen;
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen || !config.hostFingerprint) return;
    setFormData((prev) => {
      if (prev.host !== config.host || prev.port !== config.port) return prev;
      if (prev.hostFingerprint === config.hostFingerprint) return prev;
      return { ...prev, hostFingerprint: config.hostFingerprint };
    });
  }, [config.host, config.port, config.hostFingerprint, isOpen]);

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
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800 gap-3">
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
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
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
                onChange={(e) => {
                  const host = e.target.value;
                  setFormData({
                    ...formData,
                    host,
                    hostFingerprint: readHostPin(host, formData.port),
                  });
                }}
                placeholder="172.16.42.1"
                className="w-full min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-base text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-mono">SSH Port</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => {
                  const port = parseInt(e.target.value, 10);
                  const nextPort = Number.isInteger(port) ? port : 22;
                  setFormData({
                    ...formData,
                    port: nextPort,
                    hostFingerprint: readHostPin(formData.host, nextPort),
                  });
                }}
                placeholder="22"
                className="w-full min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-base text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
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
                className="w-full min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-base text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
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
                  className={`flex-1 min-h-11 text-sm font-medium rounded-lg transition-colors ${
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
                  className={`flex-1 min-h-11 text-sm font-medium rounded-lg transition-colors ${
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
                  className="w-full min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 pr-10 text-base text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
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

          {formData.hostFingerprint && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-300">Trusted SSH host key (SHA-256)</span>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, hostFingerprint: undefined });
                    if (formData.host === config.host && formData.port === config.port) onForgetHostPin();
                  }}
                  className="min-h-11 px-2 text-sm text-rose-300 hover:text-rose-200"
                >
                  Forget key
                </button>
              </div>
              <p className="text-[11px] font-mono text-slate-400 break-all">{formData.hostFingerprint}</p>
              <p className="text-[11px] text-slate-500">
                A later connection to this host is refused if the key changes. Forget the pin after you reinstall the device.
              </p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">SSH target</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              This phone opens SSH itself. Join the Pineapple Wi-Fi, or any network that can reach it, then enter the IP, username, and password and tap Test Connection. The usual address is 172.16.42.1 on port 22. The dashboard stays empty until that connection succeeds. The first accepted host key is saved on this phone.
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
                  {testResult.success ? 'SSH Handshake Succeeded' : 'SSH Connection Failed'}
                  {typeof testResult.durationMs === 'number' ? ` (${testResult.durationMs}ms)` : ''}
                </span>
              </div>
              <p className="text-[11px] opacity-90">{testResult.message || testResult.error}</p>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center justify-center space-x-2 min-h-11 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isTesting ? 'Testing SSH...' : 'Test Connection'}</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 sm:flex-none px-4 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-11 flex-1 sm:flex-none px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg transition-all"
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
