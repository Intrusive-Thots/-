import React, { useState, useEffect } from 'react';
import { SSHConfig, PineappleStats, ExecutionLog } from './types';
import { Navbar } from './components/Navbar';
import { ConnectionModal } from './components/ConnectionModal';
import { PineAPDashboard } from './components/PineAPDashboard';
import { PayloadEditor } from './components/PayloadEditor';
import { TerminalConsole } from './components/TerminalConsole';
import { PayloadScheduler } from './components/PayloadScheduler';
import { AiAssistantModal } from './components/AiAssistantModal';

export default function App() {
  // SSH Config state
  const [sshConfig, setSshConfig] = useState<SSHConfig>({
    id: 'pineapple_default',
    name: 'WiFi Pineapple Mark VII',
    host: '172.16.42.1',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    timeoutMs: 8000,
  });

  const [useSimulation, setUseSimulation] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editor' | 'terminal' | 'scheduler' | 'ai'>('dashboard');

  // Device Stats
  const [stats, setStats] = useState<PineappleStats | null>({
    connected: true,
    model: 'WiFi Pineapple Mark VII',
    firmwareVersion: 'v2.1.2 (Hak5 OS)',
    uptime: '04:12:33 up 4h 12m',
    cpuLoad: '0.18, 0.22, 0.15',
    memoryUsage: '118MB / 256MB',
    storageUsage: '27.7GB Free',
    interfaces: [
      { name: 'wlan0', type: 'Access Point', mac: '00:13:37:A4:B2:11', state: 'up', ip: '172.16.42.1' },
      { name: 'wlan1mon', type: 'Monitor Mode', mac: '00:13:37:A4:B2:12', state: 'monitor' },
      { name: 'wlan2', type: 'Out-of-Band Client', mac: '00:13:37:A4:B2:13', state: 'down' },
    ],
    pineapStatus: {
      enabled: true,
      apPool: true,
      doghouse: false,
      karma: true,
      reconActive: false,
      activeSSIDs: 42,
    },
  });

  // Logs & Execution
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
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
        setTestResult({
          success: true,
          message: data.message,
          durationMs: data.durationMs,
        });
        setStats((prev) =>
          prev
            ? { ...prev, connected: true }
            : {
                connected: true,
                model: 'WiFi Pineapple Mark VII',
                firmwareVersion: 'v2.1.2',
                uptime: 'Just connected',
                cpuLoad: '0.12',
                memoryUsage: '110MB / 256MB',
                storageUsage: '27.7GB Free',
                interfaces: [
                  { name: 'wlan0', type: 'Access Point', mac: '00:13:37:A4:B2:11', state: 'up', ip: cfgToTest.host },
                  { name: 'wlan1mon', type: 'Monitor Mode', mac: '00:13:37:A4:B2:12', state: 'monitor' },
                ],
                pineapStatus: {
                  enabled: true,
                  apPool: true,
                  doghouse: false,
                  karma: true,
                  reconActive: false,
                  activeSSIDs: 42,
                },
              }
        );
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

      const logItem: ExecutionLog = {
        id: `log_${Date.now()}`,
        command,
        timestamp: new Date().toLocaleTimeString(),
        stdout: data.stdout || '',
        stderr: data.stderr || (data.error ? `Error: ${data.error}` : ''),
        exitCode: data.exitCode ?? (data.success ? 0 : 1),
        durationMs,
        status: data.success && data.exitCode === 0 ? 'success' : 'failed',
        host: sshConfig.host,
      };

      addLog(logItem);

      // If PineAP command was toggled, update local PineAP stats state dynamically
      if (command.includes('pineap')) {
        if (command.includes('enable') || command.includes('start')) {
          setStats((prev) =>
            prev ? { ...prev, pineapStatus: { ...prev.pineapStatus, enabled: true } } : null
          );
        } else if (command.includes('disable') || command.includes('stop')) {
          setStats((prev) =>
            prev ? { ...prev, pineapStatus: { ...prev.pineapStatus, enabled: false } } : null
          );
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

  // Refresh Stats
  const handleRefreshStats = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/ssh/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sshConfig, useSimulation }),
      });
      const data = await res.json();
      if (data.success) {
        setStats((prev) => (prev ? { ...prev, connected: true } : prev));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

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
        onToggleSimulation={setUseSimulation}
        stats={stats}
        isTesting={isTesting}
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
            config={sshConfig}
            useSimulation={useSimulation}
            onExecuteQuickCommand={handleExecuteCommand}
            isExecuting={isExecuting}
            onOpenEditor={() => setActiveTab('editor')}
            onOpenTerminal={() => setActiveTab('terminal')}
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
        onToggleSimulation={setUseSimulation}
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
