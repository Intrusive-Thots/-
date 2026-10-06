import type { ScheduledPayloadJob } from '../types';

const JOBS_KEY = 'wifi_pineapple_scheduled_jobs';
const RUNNER_KEY = 'wifi_pineapple_scheduler_running';

export function readScheduledJobs(): ScheduledPayloadJob[] {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ScheduledPayloadJob[]) : [];
  } catch {
    return [];
  }
}

export function writeScheduledJobs(jobs: ScheduledPayloadJob[]): void {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

export function setScheduledJobEnabled(id: string, enabled: boolean): ScheduledPayloadJob[] {
  const jobs = readScheduledJobs().map((job) => (job.id === id ? { ...job, enabled } : job));
  writeScheduledJobs(jobs);
  return jobs;
}

export function readSchedulerRunning(): boolean {
  return localStorage.getItem(RUNNER_KEY) !== 'paused';
}

export function writeSchedulerRunning(running: boolean): void {
  localStorage.setItem(RUNNER_KEY, running ? 'running' : 'paused');
}
