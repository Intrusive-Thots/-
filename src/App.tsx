import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SSHConfig, PineappleStats, ExecutionLog } from './types';
import { Navbar } from './components/Navbar';
import { ConnectionModal } from './components/ConnectionModal';
import { PineAPDashboard } from './components/PineAPDashboard';
import { PayloadEditor } from './components/PayloadEditor';
import { TerminalConsole } from './components/TerminalConsole';
import { PayloadScheduler } from './components/PayloadScheduler';
import { AiAssistantModal } from './components/AiAssistantModal';
import { DeviceController } from './components/DeviceController';
import { LiveStatusPanel } from './components/LiveStatusPanel';
import { emptyDeviceStats, parseDeviceStatsOutput, parsePineApStatus } from './utils/deviceStats';
import { sshExec, sshStats, sshTest } from './utils/deviceSsh';
import { forgetHostPin, readHostPin, writeHostPin } from './utils/hostPin';
import { AiStatus, clearAiSettings, completeAi, loadAiStatus, saveAiSettings } from './utils/aiClient';
import { blockedSuggestionReason, buildAnalyzeMessages, buildFixMessages, buildGenerateMessages, isScriptCommand, parseFixResponse, type AiProvider } from './utils/aiFix';

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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'status' | 'editor' | 'terminal' | 'scheduler' | 'device' | 'ai'>('dashboard');

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
  const [aiModalTab, setAiModalTab] = useState<'generate' | 'analyze' | 'fix'>('generate');
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
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

  useEffect(() => {
    loadAiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, []);

  const loadStats = useCallback(async (cfg: SSHConfig) => {
    const requestId = ++statsRequest.current;
    setIsRefreshing(true);
    setStatsError(null);
    try {
      const { ok, data } = await sshStats(cfg);
      if (requestId !== statsRequest.current) return;
      if (!ok || !data.success || typeof data.output !== 'string') {
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

  const handleForgetHostPin = () => {
    forgetHostPin(sshConfig.host, sshConfig.port);
    setSshConfig((prev) => ({ ...prev, hostFingerprint: undefined }));
  };

  // Test SSH Connection
  const handleTestConnection = async (cfgToTest: SSHConfig) => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const { data } = await sshTest(cfgToTest);

      if (data.success) {
        const pinned = pinConfig(cfgToTest, data.hostFingerprint);
        setSshConfig(pinned);
        setTestResult({
          success: true,
          message: data.message,
          durationMs: data.durationMs,
        });
        await loadStats(pinned);
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
      const { data } = await sshExec(sshConfig, command);
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
      const { data } = await sshExec(sshConfig, code, {
        asScript: true,
        filename: `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${language === 'python' ? 'py' : 'sh'}`,
      });
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

  const handleRefreshStats = () => loadStats(sshConfig);

  const handleGenerateScriptApi = async (goal: string, language: 'bash' | 'python') => {
    const messages = buildGenerateMessages(goal, language);
    return completeAi(messages.system, messages.user);
  };

  const handleAnalyzeLogApi = async (log: ExecutionLog) => {
    const messages = buildAnalyzeMessages(log);
    return completeAi(messages.system, messages.user);
  };

  const handleFixLog = async (log: ExecutionLog) => {
    const messages = buildFixMessages(log);
    return parseFixResponse(await completeAi(messages.system, messages.user));
  };

  const handleSaveAi = async (input: { provider: AiProvider; model: string; apiKey: string }) => {
    setAiStatus(await saveAiSettings(input));
  };

  const handleClearAi = async () => {
    setAiStatus(await clearAiSettings());
  };

  const handleRunSuggested = (command: string) => {
    if (blockedSuggestionReason(command)) return;
    setIsAiModalOpen(false);
    if (isScriptCommand(command)) {
      void handleRunPayload(command, 'bash', 'AI suggested fix');
      return;
    }
    void handleExecuteCommand(command);
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

  const handleOpenAiFix = (log: ExecutionLog) => {
    setLogToAnalyze(log);
    setAiModalTab('fix');
    setIsAiModalOpen(true);
  };

  return (
    <div className="h-dvh max-h-dvh overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      {/* Top Header Navbar */}
      <Navbar
        config={sshConfig}
        stats={stats}
        isTesting={isTesting || isRefreshing}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshStats={handleRefreshStats}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Body Layout */}
      <main className={`flex-1 min-h-0 w-full ${activeTab === 'terminal' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto overflow-x-hidden'}`}>
        <div className={`max-w-7xl w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 ${activeTab === 'terminal' ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
        {activeTab === 'dashboard' && (
          <PineAPDashboard
            stats={stats}
            statsError={statsError}
            config={sshConfig}
            onExecuteQuickCommand={handleExecuteCommand}
            onRefreshStats={handleRefreshStats}
            isExecuting={isExecuting}
            isRefreshing={isRefreshing}
            lastLog={logs.length > 0 ? logs[logs.length - 1] : null}
            onOpenEditor={() => setActiveTab('editor')}
            onOpenTerminal={() => setActiveTab('terminal')}
            onHostFingerprint={handleObservedFingerprint}
            onAiFix={handleOpenAiFix}
          />
        )}

        {activeTab === 'status' && (
          <LiveStatusPanel config={sshConfig} onHostFingerprint={handleObservedFingerprint} />
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
            onAiFix={handleOpenAiFix}
            injectedCode={editorInjectedCode}
            onClearInjectedCode={() => setEditorInjectedCode(null)}
          />
        )}

        {activeTab === 'terminal' && (
          <TerminalConsole
            config={sshConfig}
            logs={logs}
            onExecuteCommand={handleExecuteCommand}
            onAddExecutionLog={addLog}
            isExecuting={isExecuting}
            onClearLogs={() => setLogs([])}
            onAnalyzeLog={handleOpenAiAnalyzeForLog}
            onAiFix={handleOpenAiFix}
            onHostFingerprint={handleObservedFingerprint}
          />
        )}

        {activeTab === 'device' && (
          <DeviceController
            config={sshConfig}
            onHostFingerprint={handleObservedFingerprint}
            onAiFix={handleOpenAiFix}
          />
        )}

        {activeTab === 'scheduler' && (
          <PayloadScheduler
            config={sshConfig}
            onAddExecutionLog={addLog}
            onAnalyzeLog={handleOpenAiAnalyzeForLog}
            onAiFix={handleOpenAiFix}
            initialJobToCreate={initialScheduledJob}
            onClearInitialJob={() => setInitialScheduledJob(null)}
            onHostFingerprint={handleObservedFingerprint}
          />
        )}
        </div>
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
        onForgetHostPin={handleForgetHostPin}
        aiStatus={aiStatus}
        onSaveAi={handleSaveAi}
        onClearAi={handleClearAi}
      />

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
        onFixLog={handleFixLog}
        onRunSuggested={handleRunSuggested}
      />
    </div>
  );
}
