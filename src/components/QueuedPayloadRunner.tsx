import React, { useState, useRef, useEffect } from 'react';
import { SSHConfig, PayloadTemplate, QueuedPayloadItem, AggregatedQueueLog, ExecutionLog } from '../types';
import { INITIAL_PAYLOAD_TEMPLATES } from '../data/payloadTemplates';
import {
  ListOrdered,
  Play,
  Square,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Copy,
  Check,
  Download,
  FileText,
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  CheckSquare,
  Square as SquareIcon,
  ChevronRight,
  Terminal,
  Zap,
} from 'lucide-react';

interface QueuedPayloadRunnerProps {
  config: SSHConfig;
  useSimulation: boolean;
  onAddExecutionLog: (log: ExecutionLog) => void;
  onAnalyzeLog: (log: ExecutionLog) => void;
  onClose?: () => void;
}

export const QueuedPayloadRunner: React.FC<QueuedPayloadRunnerProps> = ({
  config,
  useSimulation,
  onAddExecutionLog,
  onAnalyzeLog,
  onClose,
}) => {
  // Load templates (initial + any local custom templates)
  const [availableTemplates, setAvailableTemplates] = useState<PayloadTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('wifi_pineapple_custom_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return [...INITIAL_PAYLOAD_TEMPLATES, ...parsed];
        }
      }
    } catch (_) {}
    return INITIAL_PAYLOAD_TEMPLATES;
  });

  // Queue state
  const [queue, setQueue] = useState<QueuedPayloadItem[]>([
    {
      id: 'queue_init_1',
      templateId: 'pineap-status',
      name: 'PineAP Status Check',
      category: 'pineap',
      language: 'bash',
      code: INITIAL_PAYLOAD_TEMPLATES[0].code,
      status: 'pending',
    },
    {
      id: 'queue_init_2',
      templateId: 'system-diag-health',
      name: 'Full Hardware & Storage Health Check',
      category: 'system',
      language: 'bash',
      code: INITIAL_PAYLOAD_TEMPLATES[4].code,
      status: 'pending',
    },
  ]);

  // Selection & filtering for template browser
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Execution options
  const [stopOnError, setStopOnError] = useState<boolean>(true);
  const [delaySeconds, setDelaySeconds] = useState<number>(1);

  // Execution runtime state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'builder' | 'aggregated-log'>('builder');
  const [aggregatedLog, setAggregatedLog] = useState<AggregatedQueueLog | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Abort controller ref
  const abortRef = useRef<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll aggregated log while executing
  useEffect(() => {
    if (isRunning && activeTab === 'aggregated-log') {
      logContainerRef.current?.scrollTo({
        top: logContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [aggregatedLog?.aggregatedOutput, isRunning, activeTab]);

  // Filtered available templates
  const filteredTemplates = availableTemplates.filter((t) => {
    const matchesCat = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Toggle template selection in browser
  const toggleTemplateSelection = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Add selected templates to queue
  const handleAddSelectedToQueue = () => {
    if (selectedTemplateIds.length === 0) return;
    const itemsToAdd: QueuedPayloadItem[] = selectedTemplateIds
      .map((id): QueuedPayloadItem | null => {
        const tmpl = availableTemplates.find((t) => t.id === id);
        if (!tmpl) return null;
        return {
          id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          templateId: tmpl.id,
          name: tmpl.name,
          category: tmpl.category,
          language: tmpl.language,
          code: tmpl.code,
          status: 'pending',
        };
      })
      .filter((item): item is QueuedPayloadItem => item !== null);

    setQueue((prev) => [...prev, ...itemsToAdd]);
    setSelectedTemplateIds([]);
  };

  // Add single template to queue
  const handleAddSingleToQueue = (tmpl: PayloadTemplate) => {
    const item: QueuedPayloadItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      templateId: tmpl.id,
      name: tmpl.name,
      category: tmpl.category,
      language: tmpl.language,
      code: tmpl.code,
      status: 'pending',
    };
    setQueue((prev) => [...prev, item]);
  };

  // Load Presets
  const handleLoadPreset = (presetName: 'audit' | 'recon' | 'pineap_launch') => {
    let ids: string[] = [];
    if (presetName === 'audit') {
      ids = ['system-diag-health', 'pineap-status', 'tail-pineap-logs'];
    } else if (presetName === 'recon') {
      ids = ['interface-mac-changer', 'recon-scan-quick', 'pineap-status'];
    } else if (presetName === 'pineap_launch') {
      ids = ['pineap-status', 'pineap-toggle-start', 'tail-pineap-logs'];
    }

    const items: QueuedPayloadItem[] = ids
      .map((id): QueuedPayloadItem | null => {
        const tmpl = availableTemplates.find((t) => t.id === id);
        if (!tmpl) return null;
        return {
          id: `queue_preset_${Date.now()}_${id}`,
          templateId: tmpl.id,
          name: tmpl.name,
          category: tmpl.category,
          language: tmpl.language,
          code: tmpl.code,
          status: 'pending',
        };
      })
      .filter((i): i is QueuedPayloadItem => i !== null);

    setQueue(items);
  };

  // Reorder queue
  const moveQueueItem = (index: number, direction: 'up' | 'down') => {
    if (isRunning) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queue.length) return;

    const newQueue = [...queue];
    const [moved] = newQueue.splice(index, 1);
    newQueue.splice(targetIndex, 0, moved);
    setQueue(newQueue);
  };

  // Remove from queue
  const removeQueueItem = (index: number) => {
    if (isRunning) return;
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear queue
  const clearQueue = () => {
    if (isRunning) return;
    setQueue([]);
    setAggregatedLog(null);
  };

  // Format aggregated report string
  const generateAggregatedReport = (
    executedItems: QueuedPayloadItem[],
    overallStatus: 'completed' | 'failed' | 'aborted' | 'running',
    totalDuration: number
  ): string => {
    const divider = '='.repeat(80);
    const subDivider = '-'.repeat(80);
    const dateStr = new Date().toLocaleString();

    let output = `${divider}\n`;
    output += `WIFI PINEAPPLE BATCH PAYLOAD EXECUTION REPORT\n`;
    output += `Target: ${config.username}@${config.host}:${config.port} (${useSimulation ? 'SIMULATION MODE' : 'HARDWARE'})\n`;
    output += `Timestamp: ${dateStr}\n`;
    output += `Total Payloads in Queue: ${executedItems.length}\n`;
    output += `Overall Status: ${overallStatus.toUpperCase()}\n`;
    output += `${divider}\n\n`;

    executedItems.forEach((item, idx) => {
      output += `[STEP ${idx + 1}/${executedItems.length}] ${item.name.toUpperCase()}\n`;
      output += `Language: ${item.language} | Category: ${item.category || 'General'} | Status: ${item.status.toUpperCase()}\n`;
      output += `Exit Code: ${item.exitCode ?? 'N/A'} | Execution Duration: ${item.durationMs ?? 0}ms\n`;
      if (item.error) {
        output += `Execution Error: ${item.error}\n`;
      }
      output += `${subDivider}\n`;

      if (item.stdout && item.stdout.trim()) {
        output += `[STDOUT]\n${item.stdout.trim()}\n\n`;
      }
      if (item.stderr && item.stderr.trim()) {
        output += `[STDERR]\n${item.stderr.trim()}\n\n`;
      }
      if (!item.stdout?.trim() && !item.stderr?.trim() && item.status === 'completed') {
        output += `(No console output returned)\n\n`;
      }
      if (item.status === 'skipped') {
        output += `(Script skipped due to previous failure or abort)\n\n`;
      }
      output += `${divider}\n\n`;
    });

    const successCount = executedItems.filter((i) => i.status === 'completed' && i.exitCode === 0).length;
    const failCount = executedItems.filter((i) => i.status === 'failed' || (i.exitCode !== null && i.exitCode !== 0)).length;
    const skippedCount = executedItems.filter((i) => i.status === 'skipped' || i.status === 'pending').length;

    output += `=== FINAL BATCH EXECUTION SUMMARY ===\n`;
    output += `Total Scripts: ${executedItems.length}\n`;
    output += `Succeeded: ${successCount}\n`;
    output += `Failed: ${failCount}\n`;
    output += `Skipped: ${skippedCount}\n`;
    output += `Cumulative Runtime: ${totalDuration}ms\n`;
    output += `Final Verdict: ${overallStatus === 'completed' && failCount === 0 ? 'ALL PAYLOADS EXECUTED SUCCESSFULLY' : overallStatus === 'aborted' ? 'SEQUENCE ABORTED BY USER' : 'SEQUENCE COMPLETED WITH ISSUES'}\n`;
    output += `${divider}\n`;

    return output;
  };

  // Abort execution
  const handleAbort = () => {
    abortRef.current = true;
  };

  // Run Queued Sequence
  const handleRunSequence = async () => {
    if (queue.length === 0 || isRunning) return;

    abortRef.current = false;
    setIsRunning(true);
    setActiveTab('aggregated-log');

    // Reset status
    const currentQueue: QueuedPayloadItem[] = queue.map((item) => ({
      ...item,
      status: 'pending',
      stdout: undefined,
      stderr: undefined,
      exitCode: undefined,
      durationMs: undefined,
      error: undefined,
    }));
    setQueue([...currentQueue]);

    const queueStartTime = Date.now();
    let overallStatus: 'completed' | 'failed' | 'aborted' = 'completed';

    // Initialize blank aggregated log
    const initialReport = generateAggregatedReport(currentQueue, 'running', 0);
    const aggLog: AggregatedQueueLog = {
      id: `batch_exec_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      totalDurationMs: 0,
      overallStatus: 'running',
      totalScripts: currentQueue.length,
      completedScripts: 0,
      failedScripts: 0,
      items: [...currentQueue],
      aggregatedOutput: initialReport,
    };
    setAggregatedLog(aggLog);

    // Sequential loop
    for (let i = 0; i < currentQueue.length; i++) {
      if (abortRef.current) {
        overallStatus = 'aborted';
        for (let j = i; j < currentQueue.length; j++) {
          currentQueue[j].status = 'skipped';
        }
        break;
      }

      setCurrentRunningIndex(i);
      currentQueue[i].status = 'running';
      setQueue([...currentQueue]);

      const itemStartTime = Date.now();

      try {
        const filename = `${currentQueue[i].name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_step${i + 1}.${
          currentQueue[i].language === 'python' ? 'py' : 'sh'
        }`;

        const res = await fetch('/api/ssh/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: { ...config, useSimulation },
            command: currentQueue[i].code,
            asScript: true,
            filename,
          }),
        });

        const data = await res.json();
        const itemDurationMs = Date.now() - itemStartTime;

        if (res.ok && data.success && (data.exitCode === 0 || data.exitCode === null)) {
          currentQueue[i].status = 'completed';
          currentQueue[i].stdout = data.stdout || '';
          currentQueue[i].stderr = data.stderr || '';
          currentQueue[i].exitCode = data.exitCode ?? 0;
          currentQueue[i].durationMs = itemDurationMs;
        } else {
          currentQueue[i].status = 'failed';
          currentQueue[i].stdout = data.stdout || '';
          currentQueue[i].stderr = data.stderr || (data.error ? `Error: ${data.error}` : '');
          currentQueue[i].exitCode = data.exitCode ?? 1;
          currentQueue[i].durationMs = itemDurationMs;
          currentQueue[i].error = data.error;

          if (stopOnError) {
            overallStatus = 'failed';
            for (let j = i + 1; j < currentQueue.length; j++) {
              currentQueue[j].status = 'skipped';
            }
            break;
          }
        }
      } catch (err: any) {
        const itemDurationMs = Date.now() - itemStartTime;
        currentQueue[i].status = 'failed';
        currentQueue[i].stderr = `Network or Execution Failure: ${err.message}`;
        currentQueue[i].exitCode = 1;
        currentQueue[i].durationMs = itemDurationMs;
        currentQueue[i].error = err.message;

        if (stopOnError) {
          overallStatus = 'failed';
          for (let j = i + 1; j < currentQueue.length; j++) {
            currentQueue[j].status = 'skipped';
          }
          break;
        }
      }

      setQueue([...currentQueue]);

      // Update intermediate aggregated report
      const liveReport = generateAggregatedReport(
        currentQueue,
        i === currentQueue.length - 1 ? overallStatus : 'running',
        Date.now() - queueStartTime
      );
      setAggregatedLog((prev) =>
        prev
          ? {
              ...prev,
              items: [...currentQueue],
              totalDurationMs: Date.now() - queueStartTime,
              completedScripts: currentQueue.filter((x) => x.status === 'completed').length,
              failedScripts: currentQueue.filter((x) => x.status === 'failed').length,
              aggregatedOutput: liveReport,
            }
          : null
      );

      // Delay between steps if requested and not last item
      if (delaySeconds > 0 && i < currentQueue.length - 1 && !abortRef.current) {
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      }
    }

    const totalBatchDuration = Date.now() - queueStartTime;
    setIsRunning(false);
    setCurrentRunningIndex(-1);

    // Final aggregated report
    const finalReport = generateAggregatedReport(currentQueue, overallStatus, totalBatchDuration);
    const finalAggLog: AggregatedQueueLog = {
      id: `batch_exec_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      totalDurationMs: totalBatchDuration,
      overallStatus,
      totalScripts: currentQueue.length,
      completedScripts: currentQueue.filter((x) => x.status === 'completed').length,
      failedScripts: currentQueue.filter((x) => x.status === 'failed').length,
      items: [...currentQueue],
      aggregatedOutput: finalReport,
    };
    setAggregatedLog(finalAggLog);

    // Also push complete aggregated run into main Terminal Log archive
    const terminalArchiveItem: ExecutionLog = {
      id: `batch_log_${Date.now()}`,
      command: `[Queued Batch Sequence: ${currentQueue.length} Payloads (${currentQueue.map((q) => q.name).join(' -> ')})]`,
      timestamp: new Date().toLocaleTimeString(),
      stdout: finalReport,
      stderr: overallStatus === 'failed' ? 'One or more payloads in the queue failed or aborted.' : '',
      exitCode: overallStatus === 'completed' && finalAggLog.failedScripts === 0 ? 0 : 1,
      durationMs: totalBatchDuration,
      status: overallStatus === 'completed' && finalAggLog.failedScripts === 0 ? 'success' : 'failed',
      host: config.host,
    };
    onAddExecutionLog(terminalArchiveItem);
  };

  // Copy aggregated log
  const handleCopyAggregatedLog = () => {
    if (!aggregatedLog?.aggregatedOutput) return;
    navigator.clipboard.writeText(aggregatedLog.aggregatedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download aggregated log
  const handleDownloadAggregatedLog = () => {
    if (!aggregatedLog?.aggregatedOutput) return;
    const blob = new Blob([aggregatedLog.aggregatedOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pineapple_batch_exec_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Analyze aggregated log with Gemini AI
  const handleAnalyzeWithAI = () => {
    if (!aggregatedLog) return;
    const syntheticLog: ExecutionLog = {
      id: aggregatedLog.id,
      command: `[Queued Batch Sequence Analysis: ${aggregatedLog.items.map((i) => i.name).join(', ')}]`,
      timestamp: aggregatedLog.timestamp,
      stdout: aggregatedLog.aggregatedOutput,
      stderr: aggregatedLog.failedScripts > 0 ? `${aggregatedLog.failedScripts} payload(s) reported errors.` : '',
      exitCode: aggregatedLog.overallStatus === 'completed' && aggregatedLog.failedScripts === 0 ? 0 : 1,
      durationMs: aggregatedLog.totalDurationMs,
      status: aggregatedLog.overallStatus === 'completed' && aggregatedLog.failedScripts === 0 ? 'success' : 'failed',
      host: config.host,
    };
    onAnalyzeLog(syntheticLog);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ListOrdered className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                Queued Payload Sequence Runner
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                Batch Orchestrator
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Chain saved payloads together to run consecutively with aggregated consolidated log outputs
            </p>
          </div>
        </div>

        {/* View Switcher Tabs & Close */}
        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('builder')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'builder'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Queue Builder ({queue.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('aggregated-log')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'aggregated-log'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Aggregated Output</span>
              {aggregatedLog && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    aggregatedLog.overallStatus === 'completed' && aggregatedLog.failedScripts === 0
                      ? 'bg-emerald-400'
                      : aggregatedLog.overallStatus === 'running'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-400'
                  }`}
                />
              )}
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-xs font-mono"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'builder' ? (
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Available Saved Payloads & Presets (5 cols) */}
          <div className="lg:col-span-5 space-y-4 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider flex items-center space-x-1.5">
                <span>1. Select Saved Payloads</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {availableTemplates.length} templates
              </span>
            </div>

            {/* Quick Presets Bar */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-400 font-bold flex items-center space-x-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>One-Click Sequences (Presets):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleLoadPreset('audit')}
                  disabled={isRunning}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300/90 hover:text-amber-300 border border-slate-800 rounded-lg text-[10px] font-mono transition-colors disabled:opacity-50"
                  title="Full health check + PineAP status + tail logs"
                >
                  System Diagnostic
                </button>
                <button
                  onClick={() => handleLoadPreset('recon')}
                  disabled={isRunning}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300/90 hover:text-amber-300 border border-slate-800 rounded-lg text-[10px] font-mono transition-colors disabled:opacity-50"
                  title="Randomize MAC + Wireless scan + status check"
                >
                  Recon & Scan
                </button>
                <button
                  onClick={() => handleLoadPreset('pineap_launch')}
                  disabled={isRunning}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300/90 hover:text-amber-300 border border-slate-800 rounded-lg text-[10px] font-mono transition-colors disabled:opacity-50"
                  title="Check status + Start PineAP + Tail logs"
                >
                  PineAP Launch
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter payloads..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              {/* Categories */}
              <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                {['all', 'pineap', 'recon', 'system', 'interface', 'custom'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded-md uppercase transition-colors ${
                      categoryFilter === cat
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Template List */}
            <div className="flex-1 max-h-80 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs scrollbar-thin">
              {filteredTemplates.map((tmpl) => {
                const isSelected = selectedTemplateIds.includes(tmpl.id);
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => toggleTemplateSelection(tmpl.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <div className="text-amber-400 shrink-0">
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <SquareIcon className="w-4 h-4 text-slate-600" />}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-xs truncate">{tmpl.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{tmpl.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] uppercase text-slate-400">
                        {tmpl.language}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddSingleToQueue(tmpl);
                        }}
                        className="p-1 hover:bg-amber-500 hover:text-slate-950 text-amber-400 rounded transition-colors"
                        title="Add to queue"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bulk Add Button */}
            {selectedTemplateIds.length > 0 && (
              <button
                onClick={handleAddSelectedToQueue}
                className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Selected ({selectedTemplateIds.length}) to Queue</span>
              </button>
            )}
          </div>

          {/* Right Column: Execution Queue & Sequence Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-4 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider flex items-center space-x-1.5">
                <span>2. Execution Queue Order</span>
                <span className="text-amber-400">({queue.length} steps)</span>
              </span>
              <div className="flex items-center space-x-2">
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    disabled={isRunning}
                    className="text-[11px] text-slate-500 hover:text-rose-400 font-mono transition-colors disabled:opacity-50"
                  >
                    Clear Queue
                  </button>
                )}
              </div>
            </div>

            {/* Queue Options Bar */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={stopOnError}
                  onChange={(e) => setStopOnError(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span>Halt sequence on error</span>
              </label>

              <div className="flex items-center space-x-2 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Pause between steps:</span>
                <select
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  disabled={isRunning}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-amber-300 focus:outline-none"
                >
                  <option value={0}>0s (Instant)</option>
                  <option value={1}>1 second</option>
                  <option value={2}>2 seconds</option>
                  <option value={5}>5 seconds</option>
                </select>
              </div>
            </div>

            {/* Queue Items List */}
            <div className="flex-1 max-h-80 overflow-y-auto space-y-2 pr-1 font-mono scrollbar-thin">
              {queue.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 space-y-2 font-mono">
                  <ListOrdered className="w-8 h-8 text-slate-700" />
                  <p className="text-xs">No payloads in queue.</p>
                  <p className="text-[10px] text-slate-600">
                    Select templates from the left panel or click a preset above to queue steps.
                  </p>
                </div>
              ) : (
                queue.map((item, index) => {
                  const isCurrent = isRunning && currentRunningIndex === index;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500 text-amber-200 ring-1 ring-amber-500/30 shadow-lg'
                          : item.status === 'completed'
                          ? 'bg-slate-950/80 border-emerald-900/40 text-slate-200'
                          : item.status === 'failed'
                          ? 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                          : item.status === 'skipped'
                          ? 'bg-slate-950/40 border-slate-900 text-slate-600'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        {/* Step Number Badge */}
                        <div
                          className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                            isCurrent
                              ? 'bg-amber-500 text-slate-950 animate-pulse'
                              : item.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : item.status === 'failed'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {index + 1}
                        </div>

                        {/* Title and details */}
                        <div className="truncate">
                          <div className="font-bold text-xs flex items-center space-x-2 truncate">
                            <span className="truncate">{item.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0 uppercase">
                              {item.language}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center space-x-2 mt-0.5">
                            {item.durationMs !== undefined && <span>{item.durationMs}ms</span>}
                            {item.exitCode !== undefined && (
                              <span className={item.exitCode === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                Exit: {item.exitCode}
                              </span>
                            )}
                            {item.status === 'skipped' && <span className="text-amber-500/80">Skipped</span>}
                          </div>
                        </div>
                      </div>

                      {/* Status indicator & Order controls */}
                      <div className="flex items-center space-x-2 shrink-0 ml-2">
                        {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {item.status === 'failed' && <XCircle className="w-4 h-4 text-rose-400" />}
                        {isCurrent && <Clock className="w-4 h-4 text-amber-400 animate-spin" />}

                        {!isRunning && (
                          <div className="flex items-center space-x-0.5">
                            <button
                              onClick={() => moveQueueItem(index, 'up')}
                              disabled={index === 0}
                              className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-20 rounded"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveQueueItem(index, 'down')}
                              disabled={index === queue.length - 1}
                              className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-20 rounded"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeQueueItem(index)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                              title="Remove from queue"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Launch Sequence Bar */}
            <div className="pt-2 flex items-center space-x-3">
              {!isRunning ? (
                <button
                  onClick={handleRunSequence}
                  disabled={queue.length === 0}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-mono flex items-center justify-center space-x-2 shadow-lg transition-all disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Execute Queued Sequence ({queue.length} steps)</span>
                </button>
              ) : (
                <button
                  onClick={handleAbort}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs font-mono flex items-center justify-center space-x-2 shadow-lg transition-all animate-pulse"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Abort Sequence (Step {currentRunningIndex + 1} of {queue.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Aggregated Single Log View */
        <div className="p-4 sm:p-6 space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Total Steps:</span>
                <span className="text-slate-100 font-bold">{queue.length}</span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-emerald-400">Succeeded:</span>
                <span className="text-emerald-300 font-bold">
                  {queue.filter((q) => q.status === 'completed').length}
                </span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-rose-400">Failed:</span>
                <span className="text-rose-300 font-bold">
                  {queue.filter((q) => q.status === 'failed').length}
                </span>
              </div>
              {aggregatedLog && (
                <>
                  <span className="text-slate-700">|</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-400">Runtime:</span>
                    <span className="text-amber-300 font-bold">{aggregatedLog.totalDurationMs}ms</span>
                  </div>
                </>
              )}
            </div>

            {/* Aggregated Action Buttons */}
            <div className="flex items-center space-x-2">
              {aggregatedLog?.aggregatedOutput && (
                <>
                  <button
                    onClick={handleAnalyzeWithAI}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs border border-amber-500/30 transition-colors flex items-center space-x-1"
                    title="Send aggregated multi-script log to Gemini AI for analysis"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>AI Analyze Aggregated Log</span>
                  </button>

                  <button
                    onClick={handleCopyAggregatedLog}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Copy full aggregated output"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={handleDownloadAggregatedLog}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Download consolidated .log report"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                onClick={handleRunSequence}
                disabled={isRunning || queue.length === 0}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold transition-all disabled:opacity-40 flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Re-run</span>
              </button>
            </div>
          </div>

          {/* Aggregated Output Text Container */}
          <div
            ref={logContainerRef}
            className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-[55vh] overflow-y-auto leading-relaxed scrollbar-thin space-y-4"
          >
            {aggregatedLog?.aggregatedOutput ? (
              <pre className="text-emerald-400/90 whitespace-pre-wrap font-mono">
                {aggregatedLog.aggregatedOutput}
              </pre>
            ) : (
              <div className="py-16 text-center text-slate-500 space-y-2">
                <Terminal className="w-8 h-8 text-slate-700 mx-auto" />
                <p>No queued execution results yet.</p>
                <p className="text-[11px] text-slate-600">
                  Switch to the Queue Builder tab and click "Execute Queued Sequence" to run all payloads in sequence.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
