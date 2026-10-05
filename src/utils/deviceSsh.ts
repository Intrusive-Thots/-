import { Capacitor, registerPlugin } from '@capacitor/core';
import type { SSHConfig } from '../types';
import { METRICS_COMMAND, STATS_COMMAND, TEST_COMMAND, wrapScriptCommand } from './sshCommands';
import { interpretSystemMetrics, type MetricsBody } from './systemMetrics';
import type { CpuSample } from './deviceStats';

interface NativeSshPlugin {
  exec(options: {
    host: string;
    port: number;
    username: string;
    authType: string;
    password: string;
    privateKey: string;
    passphrase: string;
    timeoutMs: number;
    hostFingerprint: string;
    command: string;
  }): Promise<{
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    hostFingerprint?: string;
  }>;
}

const PineappleSsh = registerPlugin<NativeSshPlugin>('PineappleSsh');

const nativeCpuSamples = new Map<string, CpuSample>();

export interface SshResult<T> {
  ok: boolean;
  data: T;
}

export interface ExecBody {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  durationMs?: number;
  hostFingerprint?: string;
}

export interface StatsBody {
  success: boolean;
  output?: string;
  error?: string;
  hostFingerprint?: string;
}

export interface TestBody {
  success: boolean;
  message?: string;
  error?: string;
  hint?: string;
  stdout?: string;
  durationMs?: number;
  hostFingerprint?: string;
}

function runsOnDevice(): boolean {
  return Capacitor.isNativePlatform();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'SSH connection failed';
}

async function postJson<T>(url: string, body: unknown): Promise<SshResult<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = { success: false, error: 'The SSH service returned a response that was not JSON.' } as T;
  }
  return { ok: res.ok, data };
}

async function nativeExec(config: SSHConfig, command: string): Promise<SshResult<ExecBody>> {
  const started = Date.now();
  try {
    const result = await PineappleSsh.exec({
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      password: config.password ?? '',
      privateKey: config.privateKey ?? '',
      passphrase: config.passphrase ?? '',
      timeoutMs: config.timeoutMs ?? 0,
      hostFingerprint: config.hostFingerprint ?? '',
      command,
    });
    return {
      ok: true,
      data: {
        success: true,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.exitCode,
        durationMs: Date.now() - started,
        hostFingerprint: result.hostFingerprint,
      },
    };
  } catch (err) {
    return {
      ok: false,
      data: {
        success: false,
        error: errorMessage(err),
        durationMs: Date.now() - started,
      },
    };
  }
}

export function sshTest(config: SSHConfig): Promise<SshResult<TestBody>> {
  if (!runsOnDevice()) return postJson<TestBody>('/api/ssh/test', config);
  return nativeExec(config, TEST_COMMAND).then((result) => {
    if (!result.ok || !result.data.success) {
      return {
        ok: false,
        data: {
          success: false,
          error: result.data.error || 'SSH connection failed',
          durationMs: result.data.durationMs,
          hint: 'Check that this phone can reach the Pineapple, and that the username and password are correct.',
        },
      };
    }
    return {
      ok: true,
      data: {
        success: true,
        stdout: result.data.stdout,
        durationMs: result.data.durationMs,
        hostFingerprint: result.data.hostFingerprint,
        message: `SSH connection to ${config.host}:${config.port} verified.`,
      },
    };
  });
}

export function sshExec(
  config: SSHConfig,
  command: string,
  options?: { asScript?: boolean; filename?: string },
): Promise<SshResult<ExecBody>> {
  if (!command || typeof command !== 'string') {
    return Promise.resolve({
      ok: false,
      data: { success: false, error: 'Command string is required.' },
    });
  }
  if (!runsOnDevice()) {
    return postJson<ExecBody>('/api/ssh/exec', {
      config,
      command,
      asScript: options?.asScript,
      filename: options?.filename,
    });
  }
  const finalCommand = options?.asScript ? wrapScriptCommand(command, options.filename) : command;
  return nativeExec(config, finalCommand);
}

export function sshStats(config: SSHConfig): Promise<SshResult<StatsBody>> {
  if (!runsOnDevice()) return postJson<StatsBody>('/api/ssh/stats', config);
  return nativeExec(config, STATS_COMMAND).then((result) => {
    if (!result.ok || !result.data.success) {
      return { ok: false, data: { success: false, error: result.data.error || 'Could not read device status.' } };
    }
    return {
      ok: true,
      data: {
        success: true,
        output: result.data.stdout ?? '',
        hostFingerprint: result.data.hostFingerprint,
      },
    };
  });
}

export function sshMetrics(config: SSHConfig): Promise<SshResult<MetricsBody>> {
  if (!runsOnDevice()) return postJson<MetricsBody>('/api/ssh/system-metrics', config);
  const started = Date.now();
  return nativeExec(config, METRICS_COMMAND).then((result) => {
    if (!result.ok || !result.data.success) {
      return {
        ok: false,
        data: {
          success: false,
          mode: 'offline',
          durationMs: result.data.durationMs ?? Date.now() - started,
          error: result.data.error || 'SSH connection unavailable',
        },
      };
    }
    const interpreted = interpretSystemMetrics(
      result.data.stdout || '',
      `${config.host || ''}:${config.port || 22}`,
      nativeCpuSamples,
      result.data.durationMs ?? Date.now() - started,
      result.data.hostFingerprint,
    );
    return { ok: interpreted.status < 400, data: interpreted.body };
  });
}
