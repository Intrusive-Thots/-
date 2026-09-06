import React, { useState, useRef, useEffect } from 'react';
import { SSHConfig, ExecutionLog } from '../types';
import {
  Terminal,
  Send,
  Trash2,
  Copy,
  Check,
  Sparkles,
  ArrowDown,
  CornerDownLeft,
  Shield,
  ListOrdered,
  Layers,
} from 'lucide-react';
import { QueuedPayloadRunner } from './QueuedPayloadRunner';

interface TerminalConsoleProps {
  config: SSHConfig;
  useSimulation: boolean;
  logs: ExecutionLog[];
  onExecuteCommand: (cmd: string) => Promise<void>;
  onAddExecutionLog: (log: ExecutionLog) => void;
  isExecuting: boolean;
  onClearLogs: () => void;
  onAnalyzeLog: (log: ExecutionLog) => void;
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  config,
  useSimulation,
  logs,
  onExecuteCommand,
  onAddExecutionLog,
  isExecuting,
  onClearLogs,
  onAnalyzeLog,
}) => {
  const [terminalMode, setTerminalMode] = useState<'cli' | 'queue'>('cli');
  const [inputCommand, setInputCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isExecuting]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim() || isExecuting) return;

    const cmd = inputCommand.trim();
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setInputCommand('');
    onExecuteCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInputCommand(commandHistory[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= commandHistory.length) {
        setHistoryIndex(-1);
        setInputCommand('');
      } else {
        setHistoryIndex(nextIdx);
        setInputCommand(commandHistory[nextIdx] || '');
      }
    }
  };

  const handleCopyLogs = () => {
    const fullText = logs
      .map((l) => `[${l.timestamp}] ${config.username}@${config.host}:~# ${l.command}\n${l.stdout}\n${l.stderr}`)
      .join('\n----------------------------------------\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickCommands = [
    { label: 'PineAP Status', cmd: 'pineap get_status' },
    { label: 'Ifconfig', cmd: 'ifconfig' },
    { label: 'Airmon Interfaces', cmd: 'airmon-ng' },
    { label: 'Uptime', cmd: 'uptime' },
    { label: 'Tail Log', cmd: 'logread | tail -n 20' },
    { label: 'Wireless Config', cmd: 'uci show wireless' },
    { label: 'Storage Space', cmd: 'df -h' },
  ];

  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Terminal Container */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[75vh]">
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs font-mono gap-2">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setTerminalMode('cli')}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors flex items-center space-x-1.5 ${
                  terminalMode === 'cli'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>CLI Terminal</span>
              </button>
              <button
                type="button"
                onClick={() => setTerminalMode('queue')}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors flex items-center space-x-1.5 ${
                  terminalMode === 'queue'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Queued Sequence Runner</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {lastLog && terminalMode === 'cli' && (
              <button
                onClick={() => onAnalyzeLog(lastLog)}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-[11px] border border-amber-500/30 transition-colors flex items-center space-x-1"
                title="Analyze last output with Gemini AI"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>AI Analyze Last Command</span>
              </button>
            )}

            {terminalMode === 'cli' && (
              <>
                <button
                  onClick={handleCopyLogs}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Copy Terminal Logs"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  onClick={onClearLogs}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Clear Terminal Output"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {terminalMode === 'queue' ? (
          <div className="flex-1 overflow-y-auto">
            <QueuedPayloadRunner
              config={config}
              useSimulation={useSimulation}
              onAddExecutionLog={onAddExecutionLog}
              onAnalyzeLog={onAnalyzeLog}
              onClose={() => setTerminalMode('cli')}
            />
          </div>
        ) : (
          <>
            {/* Quick Command Bar */}
            <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center space-x-2 overflow-x-auto text-[11px] font-mono scrollbar-thin">
              <span className="text-slate-500 uppercase font-bold text-[10px] shrink-0">Quick:</span>
              <button
                onClick={() => setTerminalMode('queue')}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg shrink-0 font-bold transition-colors flex items-center space-x-1"
              >
                <ListOrdered className="w-3 h-3 text-amber-400" />
                <span>Run Queued Sequence</span>
              </button>
              {quickCommands.map((qc) => (
                <button
                  key={qc.cmd}
                  onClick={() => onExecuteCommand(qc.cmd)}
                  disabled={isExecuting}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-amber-300/90 hover:text-amber-300 border border-slate-800 rounded-lg shrink-0 transition-colors"
                >
                  {qc.label}
                </button>
              ))}
            </div>

            {/* Output Area */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-4 leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-slate-600 space-y-1 py-12 text-center font-mono">
                  <p className="text-slate-400 font-bold">WiFi Pineapple SSH Interactive Shell</p>
                  <p className="text-slate-500 text-[11px]">
                    Target: {config.username}@{config.host}:{config.port}
                  </p>
                  <p className="text-slate-600 text-[10px] mt-2">
                    Type a command below, click a quick action, or launch a Queued Batch Sequence.
                  </p>
                </div>
              ) : (
                logs.map((log) => {
                  const isBatchSequence = log.command.startsWith('[Queued Batch Sequence:');
                  return (
                    <div key={log.id} className="space-y-1">
                      {/* Prompt command line */}
                      <div className="flex items-center space-x-2 text-slate-300 font-bold">
                        <span className="text-amber-400 font-mono">root@pineapple:~#</span>
                        {isBatchSequence ? (
                          <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px]">
                            BATCH SEQUENCE
                          </span>
                        ) : null}
                        <span className="text-slate-100">{log.command}</span>
                        <span className="text-[10px] text-slate-600 ml-auto font-normal">[{log.durationMs}ms]</span>
                      </div>

                      {/* STDOUT */}
                      {log.stdout && (
                        <pre className="text-emerald-400/90 whitespace-pre-wrap font-mono text-xs pl-4 border-l-2 border-slate-800">
                          {log.stdout}
                        </pre>
                      )}

                      {/* STDERR */}
                      {log.stderr && (
                        <pre className="text-rose-400 whitespace-pre-wrap font-mono text-xs pl-4 border-l-2 border-rose-900">
                          {log.stderr}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}

              {isExecuting && (
                <div className="flex items-center space-x-2 text-amber-400 font-mono text-xs animate-pulse">
                  <span>root@pineapple:~#</span>
                  <span>Executing SSH command...</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Command Input Row */}
            <form onSubmit={handleSubmit} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
              <span className="text-amber-400 font-mono font-bold text-xs pl-2 shrink-0">
                {config.username}@{config.host}:~#
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputCommand}
                onChange={(e) => setInputCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isExecuting}
                placeholder="Enter command (e.g. pineap get_status, ifconfig, logread)..."
                className="flex-1 bg-transparent text-slate-100 font-mono text-xs focus:outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={isExecuting || !inputCommand.trim()}
                className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition-all disabled:opacity-40 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
