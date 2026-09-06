export interface SSHConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  timeoutMs?: number;
}

export interface PayloadTemplate {
  id: string;
  name: string;
  category: 'pineap' | 'recon' | 'interface' | 'system' | 'custom';
  description: string;
  language: 'bash' | 'python' | 'uci';
  code: string;
  author?: string;
  notes?: string;
  tags?: string[];
  updatedAt?: string;
  isCustom?: boolean;
}

export interface ExecutionLog {
  id: string;
  command: string;
  timestamp: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  status: 'running' | 'success' | 'failed' | 'timeout';
  host: string;
}

export interface PineappleStats {
  connected: boolean;
  model: string;
  firmwareVersion: string;
  uptime: string;
  cpuLoad: string;
  memoryUsage: string;
  storageUsage: string;
  interfaces: {
    name: string;
    type: string;
    mac: string;
    state: 'up' | 'down' | 'monitor';
    ip?: string;
  }[];
  pineapStatus: {
    enabled: boolean;
    apPool: boolean;
    doghouse: boolean;
    karma: boolean;
    reconActive: boolean;
    activeSSIDs: number;
  };
}

export interface SystemMetricPoint {
  timestamp: number; // millisecond timestamp
  timeLabel: string; // "14:02:45"
  cpuPercent: number; // 0 - 100
  memPercent: number; // 0 - 100
  memUsedMb: number;
  memTotalMb: number;
  memFreeMb: number;
  load1: number;
  load5: number;
  load15: number;
}

export interface AIScriptRequest {
  goal: string;
  pineappleModel?: string;
  language?: 'bash' | 'python';
  targetPath?: string;
}

export interface AIAnalysisRequest {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface QueuedPayloadItem {
  id: string;
  templateId?: string;
  name: string;
  category?: string;
  language: 'bash' | 'python' | 'uci';
  code: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  error?: string;
}

export interface AggregatedQueueLog {
  id: string;
  timestamp: string;
  totalDurationMs: number;
  overallStatus: 'running' | 'completed' | 'failed' | 'aborted';
  totalScripts: number;
  completedScripts: number;
  failedScripts: number;
  items: QueuedPayloadItem[];
  aggregatedOutput: string;
}

export type ScheduleTriggerType = 'once' | 'interval' | 'cron';

export type ScheduleTargetEngine = 'app' | 'openwrt-cron' | 'both';

export interface ScheduledPayloadExecution {
  id: string;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'failed';
  stdout: string;
  stderr: string;
  exitCode: number | null;
  triggerType: ScheduleTriggerType;
}

export interface ScheduledPayloadJob {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  language: 'bash' | 'python' | 'uci';
  code: string;
  triggerType: ScheduleTriggerType;
  // If 'once':
  runAt?: string; // ISO string e.g. "2026-09-05T13:30:00"
  // If 'interval':
  intervalMinutes?: number; // e.g. 5, 15, 30, 60, 120, 1440
  // If 'cron':
  cronExpression?: string; // e.g. "*/15 * * * *"
  // Engine
  targetEngine: ScheduleTargetEngine;
  hardwareSynced?: boolean;
  hardwareCronCommand?: string;
  // Execution state
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  lastStatus?: 'pending' | 'running' | 'success' | 'failed';
  // Logs
  history: ScheduledPayloadExecution[];
}

