import React, { useEffect, useRef, useState } from 'react';
import { SSHConfig } from '../types';
import { Lock, Server, CheckCircle2, AlertCircle, RefreshCw, X, Shield, Bot } from 'lucide-react';
import { readHostPin } from '../utils/hostPin';
import type { AiStatus } from '../utils/aiClient';
import { DEFAULT_MODELS, type AiProvider } from '../utils/aiFix';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SSHConfig;
  onSaveConfig: (newConfig: SSHConfig) => void;
  onTestConnection: (cfg: SSHConfig) => Promise<void>;
  isTesting: boolean;
  testResult: { success?: boolean; message?: string; error?: string; durationMs?: number } | null;
  onForgetHostPin: () => void;
  aiStatus: AiStatus | null;
  onSaveAi: (input: { provider: AiProvider; model: string; apiKey: string }) => Promise<void>;
  onClearAi: () => Promise<void>;
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
  aiStatus,
  onSaveAi,
  onClearAi,
}) => {
  const [formData, setFormData] = useState<SSHConfig>(config);
  const [showKeyInput, setShowKeyInput] = useState(config.authType === 'key');
  const [aiProvider, setAiProvider] = useState<AiProvider>(aiStatus?.provider || 'openai');
  const [aiModel, setAiModel] = useState(aiStatus?.model || DEFAULT_MODELS.openai);
  const [aiKey, setAiKey] = useState('');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setFormData(config);
      setShowKeyInput(config.authType === 'key');
    }
    if (isOpen && !wasOpen.current) {
      const provider = aiStatus?.provider || 'openai';
      setAiProvider(provider);
      setAiModel(aiStatus?.model || DEFAULT_MODELS[provider]);
      setAiKey('');
      setAiMessage(null);
    }
    wasOpen.current = isOpen;
  }, [isOpen, config, aiStatus]);

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-1.5rem))] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-100">Config</h2>
              <p className="text-xs text-slate-400">SSH login and the AI key for Fix</p>
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto min-h-0">
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
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                className="w-full min-h-28 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-base text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
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

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-slate-100">AI Fix</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Bring your own key. On the phone it is saved in Android encrypted storage and sent only to the provider you pick. This screen never writes the key into the app.
            </p>
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">Provider</span>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const provider = e.target.value as AiProvider;
                  setAiProvider(provider);
                  setAiModel(DEFAULT_MODELS[provider]);
                }}
                className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-base text-slate-100"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">Model</span>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-base text-slate-100 font-mono"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">API key</span>
              <input
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder={aiStatus?.hasKey ? 'Saved on this device. Enter a new key to replace it.' : 'Paste your API key'}
                autoComplete="off"
                className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-base text-slate-100"
              />
            </label>
            {aiMessage && <p className="text-xs text-amber-200">{aiMessage}</p>}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={aiBusy}
                onClick={async () => {
                  setAiBusy(true);
                  setAiMessage(null);
                  try {
                    await onSaveAi({ provider: aiProvider, model: aiModel, apiKey: aiKey });
                    setAiKey('');
                    setAiMessage('AI provider saved on this device.');
                  } catch (err) {
                    setAiMessage(err instanceof Error ? err.message : 'Could not save the AI key.');
                  } finally {
                    setAiBusy(false);
                  }
                }}
                className="min-h-11 flex-1 rounded-xl bg-amber-500 font-bold text-slate-950"
              >
                {aiBusy ? 'Saving…' : 'Save AI key'}
              </button>
              <button
                type="button"
                disabled={aiBusy}
                onClick={async () => {
                  setAiBusy(true);
                  setAiMessage(null);
                  try {
                    await onClearAi();
                    setAiKey('');
                    setAiMessage('AI key removed from this device.');
                  } catch (err) {
                    setAiMessage(err instanceof Error ? err.message : 'Could not clear the AI key.');
                  } finally {
                    setAiBusy(false);
                  }
                }}
                className="min-h-11 flex-1 rounded-xl border border-slate-700 text-slate-200"
              >
                Clear AI key
              </button>
            </div>
          </div>

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
