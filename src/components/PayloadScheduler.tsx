import React, { useState, useEffect, useRef } from 'react';
import {
  SSHConfig,
  ScheduledPayloadJob,
  ScheduledPayloadExecution,
  PayloadTemplate,
  ExecutionLog,
  ScheduleTriggerType,
  ScheduleTargetEngine,
} from '../types';
import {
  Clock,
  Calendar,
  CalendarClock,
  Repeat,
  Play,
  Pause,
  Trash2,
  Plus,
  Check,
  Copy,
  Sparkles,
  Terminal,
  Cpu,
  Layers,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileCode,
  History,
  ArrowRight,
  Shield,
  HardDrive,
  X,
  Radio,
  Sliders,
  ChevronDown,
  Info,
  ExternalLink,
  Download,
} from 'lucide-react';
import { INITIAL_PAYLOAD_TEMPLATES } from '../data/payloadTemplates';
import { DEFAULT_SCHEDULER_PRESETS } from '../data/schedulerPresets';
import {
  describeSchedule,
  calculateNextRunTime,
  formatTimeRemaining,
  intervalToCronExpression,
  generateOpenWrtCronLine,
  generateHardwareDeployCommand,
  generateHardwareRemoveCommand,
} from '../utils/schedulerUtils';

interface PayloadSchedulerProps {
  config: SSHConfig;
  useSimulation: boolean;
  onAddExecutionLog: (log: ExecutionLog) => void;
  onAnalyzeLog: (log: ExecutionLog) => void;
  initialJobToCreate?: {
    name: string;
    code: string;
    language: 'bash' | 'python' | 'uci';
  } | null;
  onClearInitialJob?: () => void;
}

export const PayloadScheduler: React.FC<PayloadSchedulerProps> = ({
  config,
  useSimulation,
  onAddExecutionLog,
  onAnalyzeLog,
  initialJobToCreate,
  onClearInitialJob,
}) => {
  // Load saved jobs from localStorage
  const [jobs, setJobs] = useState<ScheduledPayloadJob[]>(() => {
    try {
      const saved = localStorage.getItem('wifi_pineapple_scheduled_jobs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse scheduled jobs from localStorage', e);
    }
    // Seed initial presets
    return DEFAULT_SCHEDULER_PRESETS.map((p, idx) => {
      const id = `job_${Date.now()}_${idx}`;
      const mockJob: ScheduledPayloadJob = {
        ...p,
        id,
        createdAt: new Date().toISOString(),
        runCount: 0,
        history: [],
      };
      const nextRun = calculateNextRunTime(mockJob);
      if (nextRun) mockJob.nextRunAt = nextRun.toISOString();
      return mockJob;
    });
  });

  // Master runner toggle
  const [isSchedulerRunning, setIsSchedulerRunning] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'jobs' | 'hardware-crontab' | 'history'>('jobs');

  // Currently executing job IDs in the client
  const [executingJobIds, setExecutingJobIds] = useState<Record<string, boolean>>({});

  // Modals state
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState<boolean>(false);
  const [viewingCodeJob, setViewingCodeJob] = useState<ScheduledPayloadJob | null>(null);
  const [viewingHistoryJob, setViewingHistoryJob] = useState<ScheduledPayloadJob | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState<boolean>(false);

  // Form State for New/Edit Job
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    templateId: string;
    language: 'bash' | 'python' | 'uci';
    code: string;
    triggerType: ScheduleTriggerType;
    runAtDate: string;
    runAtTime: string;
    intervalMinutes: number;
    cronExpression: string;
    targetEngine: ScheduleTargetEngine;
  }>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 10);
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
      name: 'Custom Scheduled Task',
      description: 'Automated WiFi Pineapple task',
      templateId: 'custom',
      language: 'bash',
      code: '#!/bin/sh\n# Custom scheduled task\necho "[+] Running automated WiFi Pineapple task..."\nuptime\n',
      triggerType: 'interval',
      runAtDate: dateStr,
      runAtTime: timeStr,
      intervalMinutes: 15,
      cronExpression: '*/15 * * * *',
      targetEngine: 'app',
    };
  });

  // Hardware Crontab Inspector State
  const [hardwareCrontab, setHardwareCrontab] = useState<string>('');
  const [hardwareCronStatus, setHardwareCronStatus] = useState<string>('');
  const [hardwareSyslog, setHardwareSyslog] = useState<string>('');
  const [isLoadingCrontab, setIsLoadingCrontab] = useState<boolean>(false);
  const [copiedCrontab, setCopiedCrontab] = useState<boolean>(false);
  const [deviceSyncFeedback, setDeviceSyncFeedback] = useState<string | null>(null);

  // Real-time tick timer for countdown and scheduler trigger
  const [tick, setTick] = useState<number>(0);

  // Available templates from library + user saved
  const [availableTemplates, setAvailableTemplates] = useState<PayloadTemplate[]>(() => {
    try {
      const customSaved = localStorage.getItem('wifi_pineapple_custom_templates');
      if (customSaved) {
        const parsed = JSON.parse(customSaved);
        if (Array.isArray(parsed)) {
          return [...parsed, ...INITIAL_PAYLOAD_TEMPLATES];
        }
      }
    } catch {}
    return INITIAL_PAYLOAD_TEMPLATES;
  });

  // Handle incoming initial job to create (e.g. sent from Payload Editor)
  useEffect(() => {
    if (initialJobToCreate) {
      setFormData((prev) => ({
        ...prev,
        name: initialJobToCreate.name,
        code: initialJobToCreate.code,
        language: initialJobToCreate.language,
        templateId: 'custom',
      }));
      setIsNewJobModalOpen(true);
      if (onClearInitialJob) onClearInitialJob();
    }
  }, [initialJobToCreate, onClearInitialJob]);

  // Persist jobs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('wifi_pineapple_scheduled_jobs', JSON.stringify(jobs));
    } catch (e) {
      console.warn('Failed to save scheduled jobs to localStorage', e);
    }
  }, [jobs]);

  // 1-second interval loop for countdown UI & in-app job triggers
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Main scheduler execution engine for 'app' and 'both' targetEngines
  useEffect(() => {
    if (!isSchedulerRunning) return;

    const now = Date.now();

    jobs.forEach((job) => {
      if (!job.enabled) return;
      if (job.targetEngine !== 'app' && job.targetEngine !== 'both') return;
      if (executingJobIds[job.id]) return; // already executing

      if (!job.nextRunAt) {
        // compute next run if missing
        const next = calculateNextRunTime(job);
        if (next) {
          updateJobNextRun(job.id, next.toISOString());
        }
        return;
      }

      const nextRunTime = new Date(job.nextRunAt).getTime();
      if (!isNaN(nextRunTime) && now >= nextRunTime) {
        // Trigger execution!
        executeScheduledJob(job);
      }
    });
  }, [tick, isSchedulerRunning, jobs, executingJobIds]);

  const updateJobNextRun = (jobId: string, nextIso: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, nextRunAt: nextIso } : j))
    );
  };

  // Execute a scheduled job via SSH
  const executeScheduledJob = async (job: ScheduledPayloadJob) => {
    setExecutingJobIds((prev) => ({ ...prev, [job.id]: true }));

    // Update job status to 'running'
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, lastStatus: 'running' } : j))
    );

    const startTime = Date.now();
    const scriptFilename = `scheduled_${job.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.sh`;

    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: job.code,
          asScript: true,
          filename: scriptFilename,
        }),
      });

      const data = await res.json();
      const durationMs = Date.now() - startTime;
      const isSuccess = Boolean(data.success && (data.exitCode === 0 || data.exitCode === null));

      const executionRecord: ScheduledPayloadExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        durationMs,
        status: isSuccess ? 'success' : 'failed',
        stdout: data.stdout || '',
        stderr: data.stderr || data.error || '',
        exitCode: data.exitCode !== undefined ? data.exitCode : (isSuccess ? 0 : 1),
        triggerType: job.triggerType,
      };

      // Also record to global terminal logs for cross-tab visibility
      const terminalLog: ExecutionLog = {
        id: `log_sched_${Date.now()}`,
        command: `[Scheduled: ${job.name}] ${job.triggerType === 'once' ? 'One-time' : describeSchedule(job)}`,
        timestamp: new Date().toLocaleTimeString(),
        stdout: data.stdout || '',
        stderr: data.stderr || data.error || '',
        exitCode: data.exitCode ?? (isSuccess ? 0 : 1),
        durationMs,
        status: isSuccess ? 'success' : 'failed',
        host: config.host,
      };
      onAddExecutionLog(terminalLog);

      // Compute next run time
      let nextRunIso: string | undefined = undefined;
      let shouldKeepEnabled = job.enabled;

      if (job.triggerType === 'once') {
        shouldKeepEnabled = false; // completed one-time
        nextRunIso = undefined;
      } else {
        const nextDate = calculateNextRunTime(
          { ...job, lastRunAt: new Date().toISOString() },
          new Date()
        );
        nextRunIso = nextDate ? nextDate.toISOString() : undefined;
      }

      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== job.id) return j;
          return {
            ...j,
            enabled: shouldKeepEnabled,
            runCount: j.runCount + 1,
            lastRunAt: new Date().toISOString(),
            nextRunAt: nextRunIso,
            lastStatus: isSuccess ? 'success' : 'failed',
            history: [executionRecord, ...j.history].slice(0, 50), // keep latest 50
          };
        })
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const executionRecord: ScheduledPayloadExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        durationMs,
        status: 'failed',
        stdout: '',
        stderr: err.message || 'Execution failed',
        exitCode: 1,
        triggerType: job.triggerType,
      };

      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== job.id) return j;
          return {
            ...j,
            lastRunAt: new Date().toISOString(),
            lastStatus: 'failed',
            history: [executionRecord, ...j.history].slice(0, 50),
          };
        })
      );
    } finally {
      setExecutingJobIds((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    }
  };

  // Toggle Job Enabled / Disabled
  const handleToggleJob = (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const newEnabled = !j.enabled;
        let nextRunAt = j.nextRunAt;
        if (newEnabled && !nextRunAt) {
          const calculated = calculateNextRunTime({ ...j, enabled: true });
          nextRunAt = calculated ? calculated.toISOString() : undefined;
        }
        return {
          ...j,
          enabled: newEnabled,
          nextRunAt,
          lastStatus: newEnabled ? 'pending' : j.lastStatus,
        };
      })
    );
  };

  // Delete Job
  const handleDeleteJob = async (job: ScheduledPayloadJob) => {
    if (job.hardwareSynced) {
      const confirmRemove = window.confirm(
        `Job "${job.name}" is currently synced to the WiFi Pineapple hardware crontab. Remove it from device crontab as well?`
      );
      if (confirmRemove) {
        await handleRemoveFromHardware(job.id);
      }
    }
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
  };

  // Sync Job to Hardware OpenWrt Crontab
  const handleSyncToHardware = async (job: ScheduledPayloadJob) => {
    setDeviceSyncFeedback(`Deploying payload and registering in OpenWrt crontab...`);
    const deployCmd = generateHardwareDeployCommand(job);

    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: deployCmd,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  hardwareSynced: true,
                  hardwareCronCommand: generateOpenWrtCronLine(job),
                }
              : j
          )
        );
        setDeviceSyncFeedback(`Successfully deployed to /etc/crontabs/root on WiFi Pineapple!`);
        setTimeout(() => setDeviceSyncFeedback(null), 4000);
      } else {
        setDeviceSyncFeedback(`Error syncing to device: ${data.error || data.stderr}`);
      }
    } catch (err: any) {
      setDeviceSyncFeedback(`Failed to connect to device: ${err.message}`);
    }
  };

  // Remove Job from Hardware OpenWrt Crontab
  const handleRemoveFromHardware = async (jobId: string) => {
    const removeCmd = generateHardwareRemoveCommand(jobId);
    try {
      await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: removeCmd,
        }),
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, hardwareSynced: false, hardwareCronCommand: undefined }
            : j
        )
      );
    } catch (err) {
      console.error('Failed to remove from hardware crontab', err);
    }
  };

  // Inspect Hardware Crontab
  const handleFetchHardwareCrontab = async () => {
    setIsLoadingCrontab(true);
    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: 'crontab -l 2>/dev/null || cat /etc/crontabs/root 2>/dev/null || echo "# No crontabs configured"',
        }),
      });
      const data = await res.json();
      setHardwareCrontab(data.stdout || '# Empty crontab');

      // Check cron daemon status
      const statusRes = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: '/etc/init.d/cron status 2>/dev/null || ps | grep crond | grep -v grep || echo "Unknown"',
        }),
      });
      const statusData = await statusRes.json();
      setHardwareCronStatus(statusData.stdout || 'Status unknown');
    } catch (err: any) {
      setHardwareCrontab(`# Failed to fetch crontab: ${err.message}`);
    } finally {
      setIsLoadingCrontab(false);
    }
  };

  // Restart / Enable Cron Service on device
  const handleRestartCronDaemon = async () => {
    setIsLoadingCrontab(true);
    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: '/etc/init.d/cron enable && /etc/init.d/cron restart && /etc/init.d/cron status',
        }),
      });
      const data = await res.json();
      setHardwareCronStatus(data.stdout || 'Restarted');
      setDeviceSyncFeedback('Cron daemon enabled and restarted.');
      setTimeout(() => setDeviceSyncFeedback(null), 3500);
      handleFetchHardwareCrontab();
    } catch (err: any) {
      setDeviceSyncFeedback(`Error: ${err.message}`);
    } finally {
      setIsLoadingCrontab(false);
    }
  };

  // Fetch Cron Syslog from OpenWrt
  const handleFetchCronLogs = async () => {
    setIsLoadingCrontab(true);
    try {
      const res = await fetch('/api/ssh/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, useSimulation },
          command: 'logread 2>/dev/null | grep -i cron | tail -n 25 || echo "No cron syslog entries found."',
        }),
      });
      const data = await res.json();
      setHardwareSyslog(data.stdout || 'No cron syslog available.');
    } catch (err: any) {
      setHardwareSyslog(`Error reading logs: ${err.message}`);
    } finally {
      setIsLoadingCrontab(false);
    }
  };

  // Create Job from Form
  const handleCreateJob = () => {
    if (!formData.name.trim() || !formData.code.trim()) return;

    let runAtIso: string | undefined = undefined;
    let cronExpr = formData.cronExpression;

    if (formData.triggerType === 'once') {
      try {
        const d = new Date(`${formData.runAtDate}T${formData.runAtTime}`);
        runAtIso = d.toISOString();
      } catch {
        const fallback = new Date(Date.now() + 10 * 60 * 1000);
        runAtIso = fallback.toISOString();
      }
    } else if (formData.triggerType === 'interval') {
      cronExpr = intervalToCronExpression(formData.intervalMinutes);
    }

    const newJob: ScheduledPayloadJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: formData.name.trim(),
      description: formData.description.trim(),
      language: formData.language,
      code: formData.code,
      triggerType: formData.triggerType,
      runAt: runAtIso,
      intervalMinutes: formData.intervalMinutes,
      cronExpression: cronExpr,
      targetEngine: formData.targetEngine,
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 0,
      lastStatus: 'pending',
      history: [],
    };

    const nextDate = calculateNextRunTime(newJob);
    if (nextDate) {
      newJob.nextRunAt = nextDate.toISOString();
    }

    setJobs((prev) => [newJob, ...prev]);
    setIsNewJobModalOpen(false);

    // Auto-sync to hardware if selected
    if (formData.targetEngine === 'openwrt-cron' || formData.targetEngine === 'both') {
      handleSyncToHardware(newJob);
    }
  };

  // Select a preset into form
  const handleApplyPreset = (preset: typeof DEFAULT_SCHEDULER_PRESETS[0]) => {
    setFormData((prev) => ({
      ...prev,
      name: preset.name,
      description: preset.description || '',
      language: preset.language,
      code: preset.code,
      triggerType: preset.triggerType,
      intervalMinutes: preset.intervalMinutes || 15,
      cronExpression: preset.cronExpression || '*/15 * * * *',
      targetEngine: preset.targetEngine,
    }));
    setIsPresetModalOpen(false);
    setIsNewJobModalOpen(true);
  };

  // Quick Time Offset Shortcuts for 'once' mode
  const setQuickOffset = (minutes: number) => {
    const target = new Date(Date.now() + minutes * 60 * 1000);
    const dateStr = target.toISOString().split('T')[0];
    const timeStr = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
    setFormData((prev) => ({
      ...prev,
      runAtDate: dateStr,
      runAtTime: timeStr,
    }));
  };

  // Metrics summary
  const totalJobsCount = jobs.length;
  const activeJobsCount = jobs.filter((j) => j.enabled).length;
  const hardwareSyncedCount = jobs.filter((j) => j.hardwareSynced).length;
  const totalExecutionsCount = jobs.reduce((acc, j) => acc + j.runCount, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-slate-100">Payload Scheduler & Automation</h2>
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-semibold">
                    OpenWrt & In-App
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Automate surveillance sweeps, PineAP SSID refreshes, and OpenWrt maintenance payloads at specific times or recurring intervals.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Master Scheduler Pause/Resume Switch */}
            <button
              onClick={() => setIsSchedulerRunning(!isSchedulerRunning)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center space-x-2 transition-all shadow-sm ${
                isSchedulerRunning
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
              title={isSchedulerRunning ? 'Pause all in-app automated runs' : 'Resume in-app automated runs'}
            >
              {isSchedulerRunning ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span>In-App Runner Active</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>In-App Runner Paused</span>
                </>
              )}
            </button>

            {/* Presets Button */}
            <button
              onClick={() => setIsPresetModalOpen(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Presets</span>
            </button>

            {/* New Scheduled Job Button */}
            <button
              onClick={() => setIsNewJobModalOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-lg shadow-amber-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>New Schedule</span>
            </button>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl flex items-center space-x-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-mono">Total Tasks</p>
              <p className="text-sm font-bold text-slate-100">{totalJobsCount}</p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl flex items-center space-x-3">
            <Radio className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-mono">Active (Armed)</p>
              <p className="text-sm font-bold text-emerald-300">{activeJobsCount}</p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl flex items-center space-x-3">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-mono">Hardware Crontab</p>
              <p className="text-sm font-bold text-indigo-300">{hardwareSyncedCount}</p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl flex items-center space-x-3">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-mono">Total Runs</p>
              <p className="text-sm font-bold text-slate-100">{totalExecutionsCount}</p>
            </div>
          </div>
        </div>

        {deviceSyncFeedback && (
          <div className="mt-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
            <Info className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{deviceSyncFeedback}</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              activeTab === 'jobs'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduled Payloads ({jobs.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('hardware-crontab');
              handleFetchHardwareCrontab();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              activeTab === 'hardware-crontab'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>WiFi Pineapple Crontab (/etc/crontabs/root)</span>
          </button>
        </div>
      </div>

      {/* MAIN VIEW: Scheduled Jobs Cards */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {jobs.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-300">No Scheduled Payloads</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Create your first scheduled task to run wireless reconnaissance, PineAP broadcast cycles, or system health checks automatically.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  onClick={() => setIsPresetModalOpen(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold"
                >
                  Load Presets
                </button>
                <button
                  onClick={() => setIsNewJobModalOpen(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold"
                >
                  Create Schedule
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job) => {
                const isExecuting = executingJobIds[job.id];
                const timeRemaining = formatTimeRemaining(job.nextRunAt);

                return (
                  <div
                    key={job.id}
                    className={`bg-slate-900 border rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between relative ${
                      job.enabled
                        ? 'border-slate-800 hover:border-slate-700'
                        : 'border-slate-800/60 opacity-70 bg-slate-900/60'
                    }`}
                  >
                    {/* Header: Title, badges, enabled switch */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 bg-slate-950 text-slate-300 border border-slate-800 rounded font-mono text-[10px] uppercase font-bold">
                              {job.language}
                            </span>
                            <h3 className="font-bold text-slate-100 text-sm">{job.name}</h3>
                          </div>
                          {job.description && (
                            <p className="text-xs text-slate-400 line-clamp-2">{job.description}</p>
                          )}
                        </div>

                        {/* Enabled Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleJob(job.id)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            job.enabled ? 'bg-amber-500' : 'bg-slate-800'
                          }`}
                          title={job.enabled ? 'Pause schedule' : 'Arm / enable schedule'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                              job.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Trigger & Timing Details */}
                      <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800/90 space-y-2 text-xs font-mono">
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="flex items-center space-x-1.5 text-slate-400">
                            <Repeat className="w-3.5 h-3.5 text-amber-400" />
                            <span>Schedule:</span>
                          </span>
                          <span className="font-bold text-slate-200">{describeSchedule(job)}</span>
                        </div>

                        {job.enabled && job.nextRunAt && (
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="flex items-center space-x-1.5 text-slate-400">
                              <Clock className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Countdown:</span>
                            </span>
                            <span
                              className={`font-bold flex items-center space-x-1 ${
                                timeRemaining.isPast ? 'text-amber-400' : 'text-emerald-400'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                              <span>{timeRemaining.text}</span>
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-800/60">
                          <span>Target Engine:</span>
                          <span className="text-slate-300">
                            {job.targetEngine === 'openwrt-cron'
                              ? 'OpenWrt Hardware Crontab'
                              : job.targetEngine === 'both'
                              ? 'App & Hardware Crontab'
                              : 'In-App Active Runner'}
                          </span>
                        </div>
                      </div>

                      {/* Execution stats strip */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 px-1">
                        <div>
                          Runs: <span className="text-slate-200 font-bold">{job.runCount}</span>
                        </div>
                        {job.lastRunAt && (
                          <div className="flex items-center space-x-1">
                            <span>Last run:</span>
                            <span className="text-slate-300">
                              {new Date(job.lastRunAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                            {job.lastStatus === 'success' && (
                              <span className="text-emerald-400 font-bold">✓</span>
                            )}
                            {job.lastStatus === 'failed' && (
                              <span className="text-rose-400 font-bold">✗</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5">
                        {/* Run Now button */}
                        <button
                          onClick={() => executeScheduledJob(job)}
                          disabled={isExecuting}
                          className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all disabled:opacity-50"
                          title="Execute now manually via SSH"
                        >
                          <Play className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
                          <span>{isExecuting ? 'Running...' : 'Run Now'}</span>
                        </button>

                        {/* View Code */}
                        <button
                          onClick={() => setViewingCodeJob(job)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                          title="Inspect payload code & cron line"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                        </button>

                        {/* View History */}
                        <button
                          onClick={() => setViewingHistoryJob(job)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors flex items-center space-x-1"
                          title="View Execution History & Output"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-mono">{job.history.length}</span>
                        </button>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {/* Hardware Crontab Sync Toggle */}
                        {job.hardwareSynced ? (
                          <button
                            onClick={() => handleRemoveFromHardware(job.id)}
                            className="px-2 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 rounded-lg text-[11px] font-mono flex items-center space-x-1 transition-colors"
                            title="Synced to WiFi Pineapple hardware. Click to remove from device."
                          >
                            <Cpu className="w-3 h-3" />
                            <span>HW Synced</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSyncToHardware(job)}
                            className="px-2 py-1 bg-slate-800 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 border border-slate-700 rounded-lg text-[11px] font-mono flex items-center space-x-1 transition-colors"
                            title="Deploy to OpenWrt hardware crontab"
                          >
                            <Cpu className="w-3 h-3" />
                            <span>Sync to HW</span>
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteJob(job)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs transition-colors"
                          title="Delete scheduled job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HARDWARE CRONTAB INSPECTOR VIEW */}
      {activeTab === 'hardware-crontab' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span>WiFi Pineapple Hardware Crontab Inspector</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Path: /etc/crontabs/root on {config.username}@{config.host}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRestartCronDaemon}
                  disabled={isLoadingCrontab}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCrontab ? 'animate-spin' : ''}`} />
                  <span>Restart Cron Service</span>
                </button>

                <button
                  onClick={handleFetchHardwareCrontab}
                  disabled={isLoadingCrontab}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCrontab ? 'animate-spin' : ''}`} />
                  <span>Refresh Crontab</span>
                </button>
              </div>
            </div>

            {/* Daemon Status Strip */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">OpenWrt Cron Daemon Status:</span>
              <span className="text-emerald-400 font-bold">{hardwareCronStatus || 'Active (Polling every 60s)'}</span>
            </div>

            {/* Raw Crontab File Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">Active Crontab Entries:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(hardwareCrontab);
                    setCopiedCrontab(true);
                    setTimeout(() => setCopiedCrontab(false), 2000);
                  }}
                  className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs flex items-center space-x-1"
                >
                  {copiedCrontab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCrontab ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-amber-300/90 overflow-x-auto whitespace-pre leading-relaxed min-h-[120px]">
                {hardwareCrontab || '# Fetching /etc/crontabs/root from WiFi Pineapple...'}
              </pre>
            </div>

            {/* Cron Syslog button & viewer */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Device Cron Syslog (logread):</span>
                <button
                  onClick={handleFetchCronLogs}
                  disabled={isLoadingCrontab}
                  className="text-xs text-amber-400 hover:text-amber-300 font-mono underline"
                >
                  Fetch Recent Cron Syslog
                </button>
              </div>

              {hardwareSyslog && (
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre leading-normal max-h-48">
                  {hardwareSyslog}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create New Scheduled Job */}
      {isNewJobModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Schedule Payload Execution</h3>
                  <p className="text-[11px] text-slate-400">Set timing, frequency, and target engine on WiFi Pineapple.</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewJobModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Task Name & Description */}
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Schedule Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Hourly Reconnaissance Sweep"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the automated objective"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Payload Template Selection or Custom */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium">Payload Script</label>
                  <span className="text-[11px] text-slate-500">Pick from saved library or write custom</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={formData.templateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id === 'custom') {
                        setFormData((prev) => ({ ...prev, templateId: 'custom' }));
                      } else {
                        const tmpl = availableTemplates.find((t) => t.id === id);
                        if (tmpl) {
                          setFormData((prev) => ({
                            ...prev,
                            templateId: tmpl.id,
                            name: tmpl.name,
                            description: tmpl.description,
                            language: tmpl.language,
                            code: tmpl.code,
                          }));
                        }
                      }
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="custom">✏️ Custom Script / Quick Command</option>
                    <optgroup label="Built-in & Custom Payloads">
                      {availableTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.language})
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  <select
                    value={formData.language}
                    onChange={(e) =>
                      setFormData({ ...formData, language: e.target.value as 'bash' | 'python' | 'uci' })
                    }
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="bash">Bash / POSIX Shell (/bin/sh)</option>
                    <option value="python">Python 3 (/usr/bin/python3)</option>
                    <option value="uci">UCI Config Batch</option>
                  </select>
                </div>

                <textarea
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-amber-300/90 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                  placeholder="#!/bin/sh&#10;# Script code to execute on schedule"
                />
              </div>

              {/* Timing / Trigger Type Selection */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <label className="block text-slate-300 font-medium">Trigger Timing</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, triggerType: 'interval' })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      formData.triggerType === 'interval'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Repeat className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <span>Recurring Interval</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, triggerType: 'once' })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      formData.triggerType === 'once'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                    <span>Specific Date & Time</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, triggerType: 'cron' })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      formData.triggerType === 'cron'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Terminal className="w-4 h-4 mx-auto mb-1 text-indigo-400" />
                    <span>Cron Expression</span>
                  </button>
                </div>

                {/* Sub-options for Interval */}
                {formData.triggerType === 'interval' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Run Every:</span>
                      <span className="font-bold text-amber-300">
                        {formData.intervalMinutes >= 60
                          ? `${formData.intervalMinutes / 60} hour(s)`
                          : `${formData.intervalMinutes} minute(s)`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {[1, 5, 10, 15, 30, 60, 120, 360, 720, 1440].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setFormData({ ...formData, intervalMinutes: mins })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                            formData.intervalMinutes === mins
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-options for Specific Date & Time */}
                {formData.triggerType === 'once' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Target Date</label>
                        <input
                          type="date"
                          value={formData.runAtDate}
                          onChange={(e) => setFormData({ ...formData, runAtDate: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Target Time</label>
                        <input
                          type="time"
                          value={formData.runAtTime}
                          onChange={(e) => setFormData({ ...formData, runAtTime: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                        />
                      </div>
                    </div>

                    {/* Quick offset buttons */}
                    <div className="flex items-center space-x-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 uppercase font-mono">Quick:</span>
                      {[5, 15, 30, 60, 360, 1440].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setQuickOffset(mins)}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 rounded text-[11px] font-mono"
                        >
                          +{mins < 60 ? `${mins}m` : `${mins / 60}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-options for Cron Expression */}
                {formData.triggerType === 'cron' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <label className="block text-[11px] text-slate-400">Standard 5-field Cron Expression</label>
                    <input
                      type="text"
                      value={formData.cronExpression}
                      onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                      placeholder="*/15 * * * *"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 font-mono text-amber-300 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 font-mono">
                      Format: [minute] [hour] [day of month] [month] [day of week]
                    </p>
                  </div>
                )}
              </div>

              {/* Target Engine */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-slate-300 font-medium">Execution Engine</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, targetEngine: 'app' })}
                    className={`p-2 rounded-xl border text-left text-xs transition-colors ${
                      formData.targetEngine === 'app'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>In-App Active</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Runs via browser session with live terminal logs.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, targetEngine: 'openwrt-cron' })}
                    className={`p-2 rounded-xl border text-left text-xs transition-colors ${
                      formData.targetEngine === 'openwrt-cron'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold flex items-center space-x-1">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Hardware Cron</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Installs directly into OpenWrt /etc/crontabs/root.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, targetEngine: 'both' })}
                    className={`p-2 rounded-xl border text-left text-xs transition-colors ${
                      formData.targetEngine === 'both'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold flex items-center space-x-1">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Hybrid (Both)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Hardware autonomous with active app monitor.</p>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-2 px-5 py-3 border-t border-slate-800 bg-slate-900/80">
              <button
                type="button"
                onClick={() => setIsNewJobModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateJob}
                disabled={!formData.name.trim() || !formData.code.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow disabled:opacity-40"
              >
                Save & Arm Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Presets Chooser */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">WiFi Pineapple Automation Presets</h3>
              </div>
              <button
                onClick={() => setIsPresetModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {DEFAULT_SCHEDULER_PRESETS.map((preset, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-900 text-amber-400 font-mono text-[10px] rounded uppercase font-bold border border-slate-800">
                        {preset.language}
                      </span>
                      <h4 className="text-xs font-bold text-slate-200">{preset.name}</h4>
                    </div>
                    <p className="text-xs text-slate-400">{preset.description}</p>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-500 font-mono pt-1">
                      <span>Schedule: Every {preset.intervalMinutes}m</span>
                      <span>Target: {preset.targetEngine}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleApplyPreset(preset)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shrink-0 transition-colors"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: View Job Code & Crontab Line */}
      {viewingCodeJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{viewingCodeJob.name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {viewingCodeJob.language.toUpperCase()} • {describeSchedule(viewingCodeJob)}
                </p>
              </div>
              <button
                onClick={() => setViewingCodeJob(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="space-y-1">
                <span className="font-mono text-slate-400 font-bold">OpenWrt Crontab Line:</span>
                <pre className="bg-slate-950 border border-slate-800 p-3 rounded-xl font-mono text-emerald-400 overflow-x-auto">
                  {generateOpenWrtCronLine(viewingCodeJob)}
                </pre>
              </div>

              <div className="space-y-1">
                <span className="font-mono text-slate-400 font-bold">Script Code:</span>
                <pre className="bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-amber-300 overflow-x-auto whitespace-pre leading-relaxed">
                  {viewingCodeJob.code}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end px-5 py-3 border-t border-slate-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewingCodeJob.code);
                  alert('Script code copied to clipboard!');
                }}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
              >
                Copy Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: Execution History & Output */}
      {viewingHistoryJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Execution History: {viewingHistoryJob.name}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Total Runs: {viewingHistoryJob.runCount} • Latest {viewingHistoryJob.history.length} logged
                </p>
              </div>
              <button
                onClick={() => setViewingHistoryJob(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {viewingHistoryJob.history.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-mono">
                  No automated runs recorded yet for this task.
                </div>
              ) : (
                viewingHistoryJob.history.map((exec) => (
                  <div
                    key={exec.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            exec.status === 'success'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {exec.status.toUpperCase()}
                        </span>
                        <span className="text-slate-300">{new Date(exec.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500 text-[11px]">[{exec.durationMs}ms]</span>
                        <button
                          onClick={() => {
                            const mockLog: ExecutionLog = {
                              id: exec.id,
                              command: `Scheduled Job: ${viewingHistoryJob.name}`,
                              timestamp: new Date(exec.timestamp).toLocaleTimeString(),
                              stdout: exec.stdout,
                              stderr: exec.stderr,
                              exitCode: exec.exitCode,
                              durationMs: exec.durationMs,
                              status: exec.status,
                              host: config.host,
                            };
                            onAnalyzeLog(mockLog);
                          }}
                          className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] flex items-center space-x-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Analyze Output</span>
                        </button>
                      </div>
                    </div>

                    {exec.stdout && (
                      <pre className="text-emerald-400/90 whitespace-pre-wrap font-mono text-xs pl-3 border-l-2 border-slate-800 max-h-48 overflow-y-auto">
                        {exec.stdout}
                      </pre>
                    )}

                    {exec.stderr && (
                      <pre className="text-rose-400 whitespace-pre-wrap font-mono text-xs pl-3 border-l-2 border-rose-900 max-h-48 overflow-y-auto">
                        {exec.stderr}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/80">
              <button
                onClick={() => {
                  setJobs((prev) =>
                    prev.map((j) => (j.id === viewingHistoryJob.id ? { ...j, history: [] } : j))
                  );
                  setViewingHistoryJob((prev) => (prev ? { ...prev, history: [] } : null));
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 rounded-xl text-xs transition-colors"
              >
                Clear History
              </button>
              <button
                onClick={() => setViewingHistoryJob(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
