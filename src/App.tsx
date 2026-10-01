import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SSHConfig, PineappleStats, ExecutionLog } from './types';
import { Navbar } from './components/Navbar';
import { ConnectionModal } from './components/ConnectionModal';
import { PineAPDashboard } from './components/PineAPDashboard';
import { PayloadEditor } from './components/PayloadEditor';
import { TerminalConsole } from './components/TerminalConsole';
import { PayloadScheduler } from './components/PayloadScheduler';
import { AiAssistantModal } from './components/AiAssistantModal';
import { emptyDeviceStats, parseDeviceStatsOutput, parsePineApStatus } from './utils/deviceStats';
import { forgetHostPin, readHostPin, writeHostPin } from './utils/hostPin';

const DEFAULT_HOST = '172.16.42.1';
const DEFAULT_PORT = 22;

function pinConfig(cfg: SSHConfig, fingerprint?: string): SSHConfig {
  if (!fingerprint || cfg.hostFingerprint) return cfg;
  writeHostPin(cfg.host, cfg.port, fingerprint);
  return { ...cfg, hostFingerprint: fingerprint };
}

export default function App() {
  // SSH Config state. The host key pin is restored; the password is not.
  const [sshConfig, setSshConfig] = useState<SSHConfig>({
    id: 'pineapple_default',
    name: 'WiFi Pineapple Mark VII',
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    username: 'root',
    authType: 'password',
    password: '',
    timeoutMs: 8000,
    hostFingerprint: readHostPin(DEFAULT_HOST, DEFAULT_PORT),
  });

  const [useSimulation, setUseSimulation] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editor' | 'terminal' | 'scheduler' | 'ai'>('dashboard');

  // Device stats stay empty until a status read succeeds.
  const [stats, setStats] = useState<PineappleStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Logs & Execution
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiModalTab, setAiModalTab] = useState<'generate' | 'analyze'>('generate');
  const [logToAnalyze, setLogToAnalyze] = useState<ExecutionLog | null>(null);
  const [editorInjectedCode, setEditorInjectedCode] = useState<{
    code: string;
    language: 'bash' | 'python' | 'uci';
    name?: string;
  } | null>(null);
  const [initialScheduledJob, setInitialScheduledJob] = useState<{
    name: string;
    code: string;
    language: 'bash' | 'python' | 'uci';
  } | null>(null);

  // Helper to add execution log
  const addLog = (newLog: ExecutionLog) => {
    setLogs((prev) => [...prev, newLog]);
  };

  const handleObservedFingerprint = useCallback((fingerprint: string) => {
    setSshConfig((prev) => pinConfig(prev, fingerprint));
  }, []);

  const statsRequest = useRef(0);

  const loadStats = useCallback(async (cfg: SSHConfig, simulation: boolean) => {
    const requestId = ++statsRequest.current;
    setIsRefreshing(true);
    setStatsError(null);
    try {
      const res = await fetch('/api/ssh/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, useSimulation: simulation }),
      });
      const data = await res.json();
      if (requestId !== statsRequest.current) return;
      if (!res.ok || !data.success || typeof data.output !== 'string') {
        setStats((prev) => (prev ? { ...prev, connected: false } : null));
        setStatsError(data.error || 'Could not read device status.');
        return;
      }
      const pinned = pinConfig(cfg, data.hostFingerprint);
      if (pinned.hostFingerprint !== cfg.hostFingerprint) setSshConfig(pinned);
      setStats({ ...parseDeviceStatsOutput(data.output), connected: true });
    } catch (err: any) {
      if (requestId !== statsRequest.current) return;
      setStats((prev) => (prev ? { ...prev, connected: false } : null));
      setStatsError(err.message || 'Status request failed.');
    } finally {
      if (requestId === statsRequest.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!useSimulation) return;
    void loadStats(sshConfig, true);
    // Reload the emulator snapshot when the selected target changes. Hardware mode waits for an explicit test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSimulation, sshConfig.host, sshConfig.port, sshConfig.username]);

  const handleToggleSimulation = (enabled: boolean) => {
    statsRequest.current += 1;
    setIsRefreshing(false);
    setUseSimulation(enabled);
    setStats(null);
    setStatsError(null);
    setTestResult(null);
  };

  const handleForgetHostPin = () => {
    forgetHostPin(sshConfig.host, sshConfig.port);
    setSshConfig((prev) => ({ ...prev, hostFingerprint: undefined }));
  };

  // Test SSH Connection
  const handleTestConnection = async (cfgToTest: SSHConfig) => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/ssh/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfgToTest, useSimulation }),
      });
      const data = await res.json();

      if (data.success) {
        const pinned = pinConfig(cfgToTest, data.hostFingerprint);
        setSshConfig(pinned);
        setTestResult({
          success: true,
          message: data.message,
          durationMs: data.durationMs,
        });
        await loadStats(pinned, useSimulation);
      } else {
        setTestResult({
          success: false,
          error: data.error || 'Connection failed',
          durationMs: data.durationMs,
        });
        setStats((prev) => (prev ? { ...prev, connected: false } : null));
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Network request error',
      });
      setStats((prev) => (prev ? { ...prev, connected: false } : null));
    } finally {
      setIsTesting(false);
    }
  };

  // Execute SSH Command
  const handleExecuteCommand = async (command: string) => {
    setIsExecuting(true);
    const startTime = Date.now();

    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...sshConfig, useSimulation },
          command,
        }),
      });

      const data = await res.json();
      const durationMs = Date.now() - startTime;
      const succeeded = Boolean(data.success && data.exitCode === 0);

      const logItem: ExecutionLog = {
        id: `log_${Date.now()}`,
        command,
        timestamp: new Date().toLocaleTimeString(),
        stdout: data.stdout || '',
        stderr: data.stderr || (data.error ? `Error: ${data.error}` : ''),
        exitCode: data.exitCode ?? (data.success ? 0 : 1),
        durationMs,
        status: succeeded ? 'success' : 'failed',
        host: sshConfig.host,
      };

      addLog(logItem);

      if (succeeded && data.hostFingerprint) {
        setSshConfig((prev) => pinConfig(prev, data.hostFingerprint));
      }

      if (succeeded) {
        const pineap = parsePineApStatus(`${data.stdout || ''}\n${data.stderr || ''}`);
        if (pineap) {
          setStats((prev) => {
            const base = prev ?? emptyDeviceStats(true);
            return { ...base, connected: true, pineapStatus: pineap };
          });
        }
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const logItem: ExecutionLog = {
        id: `log_${Date.now()}`,
        command,
        timestamp: new Date().toLocaleTimeString(),
        stdout: '',
        stderr: `Network Error executing SSH command: ${err.message}`,
        exitCode: 1,
        durationMs,
        status: 'failed',
        host: sshConfig.host,
      };
      addLog(logItem);
    } finally {
      setIsExecuting(false);
    }
  };

  // Run Payload Script
  const handleRunPayload = async (code: string, language: string, name: string) => {
    setIsExecuting(true);
    const startTime = Date.now();

    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...sshConfig, useSimulation },
          command: code,
          asScript: true,
          filename: `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${language === 'python' ? 'py' : 'sh'}`,
        }),
      });

      const data = await res.json();
      const durationMs = Date.now() - startTime;
      if (data.hostFingerprint) {
        setSshConfig((prev) => pinConfig(prev, data.hostFingerprint));
      }

      const logItem: ExecutionLog = {
        id: `log_${Date.now()}`,
        command: `[Payload Script: ${name}]`,
        timestamp: new Date().toLocaleTimeString(),
        stdout: data.stdout || '',
        stderr: data.stderr || (data.error ? `Error: ${data.error}` : ''),
        exitCode: data.exitCode ?? (data.success ? 0 : 1),
        durationMs,
        status: data.success && data.exitCode === 0 ? 'success' : 'failed',
        host: sshConfig.host,
      };

      addLog(logItem);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const logItem: ExecutionLog = {
        id: `log_${Date.now()}`,
        command: `[Payload Script: ${name}]`,
        timestamp: new Date().toLocaleTimeString(),
        stdout: '',
        stderr: `Execution error: ${err.message}`,
        exitCode: 1,
        durationMs,
        status: 'failed',
        host: sshConfig.host,
      };
      addLog(logItem);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRefreshStats = () => loadStats(sshConfig, useSimulation);

  // AI Script Generator Call
  const handleGenerateScriptApi = async (goal: string, language: 'bash' | 'python') => {
    const res = await fetch('/api/ai/generate-payload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, language }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate payload');
    }
    return data.text;
  };

  // AI Log Analysis Call
  const handleAnalyzeLogApi = async (log: ExecutionLog) => {
    const res = await fetch('/api/ai/analyze-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: log.command,
        stdout: log.stdout,
        stderr: log.stderr,
        exitCode: log.exitCode,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to analyze log');
    }
    return data.analysis;
  };

  const handleOpenAiAnalyzeForLog = (log: ExecutionLog) => {
    setLogToAnalyze(log);
    setAiModalTab('analyze');
    setIsAiModalOpen(true);
  };

  const handleOpenAiGenerator = () => {
    setAiModalTab('generate');
    setIsAiModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Header Navbar */}
      <Navbar
        config={sshConfig}
        useSimulation={useSimulation}
        onToggleSimulation={handleToggleSimulation}
        stats={stats}
        isTesting={isTesting || isRefreshing}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshStats={handleRefreshStats}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Body Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <PineAPDashboard
            stats={stats}
            statsError={statsError}
            config={sshConfig}
            useSimulation={useSimulation}
            onExecuteQuickCommand={handleExecuteCommand}
            onRefreshStats={handleRefreshStats}
            isExecuting={isExecuting}
            isRefreshing={isRefreshing}
            lastLog={logs.length > 0 ? logs[logs.length - 1] : null}
            onOpenEditor={() => setActiveTab('editor')}
            onOpenTerminal={() => setActiveTab('terminal')}
            onHostFingerprint={handleObservedFingerprint}
          />
        )}

        {activeTab === 'editor' && (
          <PayloadEditor
            onRunPayload={handleRunPayload}
            onSchedulePayload={(name, code, language) => {
              setInitialScheduledJob({ name, code, language });
              setActiveTab('scheduler');
            }}
            isExecuting={isExecuting}
            lastLog={logs.length > 0 ? logs[logs.length - 1] : null}
            onOpenAiGenerator={handleOpenAiGenerator}
            onAnalyzeLog={handleOpenAiAnalyzeForLog}
            injectedCode={editorInjectedCode}
            onClearInjectedCode={() => setEditorInjectedCode(null)}
          />
        )}

        {activeTab === 'terminal' && (
          <TerminalConsole
            config={sshConfig}
            useSimulation={useSimulation}
            logs={logs}
            onExecuteCommand={handleExecuteCommand}
            onAddExecutionLog={addLog}
            isExecuting={isExecuting}
            onClearLogs={() => setLogs([])}
            onAnalyzeLog={handleOpenAiAnalyzeForLog}
            onHostFingerprint={handleObservedFingerprint}
          />
        )}

        {activeTab === 'scheduler' && (
          <PayloadScheduler
            config={sshConfig}
            useSimulation={useSimulation}
            onAddExecutionLog={addLog}
            onAnalyzeLog={handleOpenAiAnalyzeForLog}
            initialJobToCreate={initialScheduledJob}
            onClearInitialJob={() => setInitialScheduledJob(null)}
            onHostFingerprint={handleObservedFingerprint}
          />
        )}
      </main>

      {/* Connection Config Modal */}
      <ConnectionModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={sshConfig}
        onSaveConfig={setSshConfig}
        onTestConnection={handleTestConnection}
        isTesting={isTesting}
        testResult={testResult}
        useSimulation={useSimulation}
        onToggleSimulation={handleToggleSimulation}
        onForgetHostPin={handleForgetHostPin}
      />

      {/* Gemini AI Assistant Modal */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        activeTab={aiModalTab}
        setActiveTab={setAiModalTab}
        onGenerateScript={handleGenerateScriptApi}
        onInsertCodeToEditor={(cleanCode) => {
          const isPython = cleanCode.includes('python') || cleanCode.includes('import ') || cleanCode.startsWith('#!/usr/bin/env python');
          setEditorInjectedCode({
            code: cleanCode,
            language: isPython ? 'python' : 'bash',
            name: 'AI Generated Script',
          });
          setActiveTab('editor');
        }}
        logToAnalyze={logToAnalyze}
        onAnalyzeLogApi={handleAnalyzeLogApi}
      />
    </div>
  );
}
