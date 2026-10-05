import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Pause, Play, Radio, RefreshCw, Square, Users, Wifi } from 'lucide-react';
import type { SSHConfig } from '../types';
import { sshExec } from '../utils/deviceSsh';
import { PINEAP_START_COMMAND, PINEAP_STOP_COMMAND } from '../utils/sshCommands';
import {
  LIVE_STATUS_COMMAND,
  SURVEY_START_COMMAND,
  SURVEY_STOP_COMMAND,
  cronInitCommand,
  describeActivity,
  parseLiveStatus,
  type LiveSnapshot,
} from '../utils/liveStatus';
import {
  readScheduledJobs,
  readSchedulerRunning,
  setScheduledJobEnabled,
  writeSchedulerRunning,
} from '../utils/schedulerStore';

interface LiveStatusPanelProps {
  config: SSHConfig;
  onHostFingerprint?: (fingerprint: string) => void;
}

const REFRESH_MS = 8000;

export const LiveStatusPanel: React.FC<LiveStatusPanelProps> = ({ config, onHostFingerprint }) => {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [jobs, setJobs] = useState(readScheduledJobs);
  const [schedulerRunning, setSchedulerRunning] = useState(readSchedulerRunning);

  const load = useCallback(async () => {
    setBusy((current) => current || 'refresh');
    try {
      const { data } = await sshExec({ ...config, timeoutMs: 15000 }, LIVE_STATUS_COMMAND);
      if (data.hostFingerprint) onHostFingerprint?.(data.hostFingerprint);
      if (!data.success || data.exitCode !== 0 || !data.stdout) {
        setError(data.error || data.stderr || 'Could not read live status.');
        return;
      }
      setError(null);
      setSnapshot(parseLiveStatus(data.stdout));
      setUpdatedAt(new Date().toLocaleTimeString());
      setJobs(readScheduledJobs());
      setSchedulerRunning(readSchedulerRunning());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSH request failed');
    } finally {
      setBusy((current) => (current === 'refresh' ? null : current));
    }
  }, [config, onHostFingerprint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (!busy) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, busy, load]);

  const runControl = async (label: string, command: string) => {
    setBusy(label);
    setError(null);
    try {
      const { data } = await sshExec({ ...config, timeoutMs: 20000 }, command);
      if (data.hostFingerprint) onHostFingerprint?.(data.hostFingerprint);
      if (!data.success || data.exitCode !== 0) {
        setError(data.error || data.stderr || `${label} failed.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSH request failed');
    } finally {
      setBusy(null);
      await load();
    }
  };

  const armedJobs = jobs.filter((job) => job.enabled).length;
  const summary = snapshot
    ? describeActivity({
        pineapKnown: snapshot.pineapKnown,
        pineapEnabled: snapshot.pineapEnabled,
        broadcasting: snapshot.broadcasting,
        ssidCount: snapshot.ssidCount,
        clientCount: snapshot.clients.length,
        surveyRunning: snapshot.surveyRunning,
        processNames: snapshot.processes.map((item) => item.name),
        armedJobs,
        schedulerRunning,
        cronService: snapshot.cronService,
      })
    : 'Nothing read yet. Save the SSH login in Config, then this page polls the Pineapple.';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <Activity className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-100">Live status</h2>
            <p className="text-xs text-slate-400">
              {updatedAt ? `Updated ${updatedAt}` : 'Waiting for the first SSH read'}
              {autoRefresh ? ' · refreshes every 8s' : ' · auto-refresh paused'}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{summary}</p>
        {error && <p className="text-sm text-rose-300 break-words">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={Boolean(busy)}
            className="min-h-11 px-3 rounded-xl bg-amber-500 font-bold text-slate-950 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setAutoRefresh((value) => !value)}
            className="min-h-11 px-3 rounded-xl border border-slate-700 text-sm text-slate-200"
          >
            {autoRefresh ? 'Pause refresh' : 'Resume refresh'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold">PineAP</h3>
        </div>
        <p className="text-sm text-slate-300">
          {snapshot?.pineapKnown
            ? snapshot.pineapEnabled
              ? snapshot.broadcasting
                ? `Broadcasting ${snapshot.ssidCount} SSID${snapshot.ssidCount === 1 ? '' : 's'}`
                : 'Suite is on. Broadcast pool is off.'
              : 'Stopped'
            : 'Unread'}
        </p>
        {snapshot && snapshot.ssids.length > 0 && (
          <ul className="max-h-40 overflow-y-auto space-y-1 text-sm font-mono text-amber-200">
            {snapshot.ssids.map((ssid) => (
              <li key={ssid} className="break-all">{ssid}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runControl('start-pineap', PINEAP_START_COMMAND)}
            className="min-h-11 px-3 rounded-xl bg-amber-500 font-bold text-slate-950 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Start PineAP
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runControl('stop-pineap', PINEAP_STOP_COMMAND)}
            className="min-h-11 px-3 rounded-xl border border-slate-700 text-slate-200 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Square className="w-4 h-4" />
            Stop PineAP
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold">Clients on this Pineapple</h3>
        </div>
        {!snapshot || snapshot.clients.length === 0 ? (
          <p className="text-sm text-slate-400">No DHCP leases or associated stations in the last read.</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.clients.map((client) => (
              <li key={`${client.label}-${client.detail}`} className="text-sm">
                <div className="font-medium text-slate-100 break-all">{client.label}</div>
                <div className="text-xs font-mono text-slate-400 break-all">{client.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold">Nearby AP survey</h3>
        </div>
        <p className="text-sm text-slate-300">{snapshot?.surveyRunning ? 'Survey process is running.' : 'No survey is running.'}</p>
        {snapshot?.surveyTail && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs font-mono text-slate-300">{snapshot.surveyTail}</pre>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || Boolean(snapshot?.surveyRunning)}
            onClick={() => void runControl('survey-start', SURVEY_START_COMMAND)}
            className="min-h-11 px-3 rounded-xl bg-slate-100 font-bold text-slate-950 disabled:opacity-50"
          >
            Start survey
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runControl('survey-stop', SURVEY_STOP_COMMAND)}
            className="min-h-11 px-3 rounded-xl border border-slate-700 text-slate-200 disabled:opacity-50"
          >
            Stop survey
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-bold">Services</h3>
        {!snapshot || snapshot.processes.length === 0 ? (
          <p className="text-sm text-slate-400">No pineap, hostapd, dnsmasq, dropbear, uhttpd, or cron process in the last read.</p>
        ) : (
          <ul className="space-y-1 text-sm font-mono text-slate-200">
            {snapshot.processes.map((proc) => (
              <li key={proc.name}>{proc.name} pid {proc.pid}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-400">Uptime {snapshot?.uptime || '—'} · load {snapshot?.load || '—'}</p>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-bold">Scheduled jobs</h3>
        <p className="text-sm text-slate-300">
          {schedulerRunning ? 'In-app runner is active.' : 'In-app runner is paused.'} Device cron is {snapshot?.cronService || 'unread'}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              writeSchedulerRunning(!schedulerRunning);
              setSchedulerRunning(!schedulerRunning);
            }}
            className="min-h-11 px-3 rounded-xl border border-slate-700 text-slate-200 inline-flex items-center gap-2"
          >
            {schedulerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {schedulerRunning ? 'Pause in-app jobs' : 'Resume in-app jobs'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runControl('cron-stop', cronInitCommand('stop'))}
            className="min-h-11 px-3 rounded-xl border border-slate-700 text-slate-200 disabled:opacity-50"
          >
            Stop device cron
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runControl('cron-start', cronInitCommand('start'))}
            className="min-h-11 px-3 rounded-xl border border-slate-700 text-slate-200 disabled:opacity-50"
          >
            Start device cron
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-400">No in-app jobs saved yet. Open Jobs to create one.</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100 break-words">{job.name}</div>
                  <div className="text-xs text-slate-400">{job.enabled ? 'Armed' : 'Paused'} · {job.triggerType}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setJobs(setScheduledJobEnabled(job.id, !job.enabled))}
                  className="min-h-11 px-3 rounded-xl border border-slate-700 text-sm text-slate-200"
                >
                  {job.enabled ? 'Pause' : 'Arm'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {snapshot && snapshot.cronLines.length > 0 && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs font-mono text-slate-300">{snapshot.cronLines.join('\n')}</pre>
        )}
      </section>
    </div>
  );
};
