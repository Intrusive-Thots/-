import type { SystemMetricPoint } from '../types';
import { cpuPercentBetween, parseProcStatCpu, type CpuSample } from './deviceStats';

export interface MetricsBody {
  success: boolean;
  metric?: SystemMetricPoint | null;
  pending?: boolean;
  mode: 'live' | 'offline';
  error?: string;
  durationMs: number;
  hostFingerprint?: string;
}

export function interpretSystemMetrics(
  output: string,
  sampleKey: string,
  samples: Map<string, CpuSample>,
  durationMs: number,
  hostFingerprint?: string,
): { status: number; body: MetricsBody } {
  let load1 = 0;
  let load5 = 0;
  let load15 = 0;
  const loadMatch = output.match(/([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)/);
  if (loadMatch) {
    load1 = parseFloat(loadMatch[1]);
    load5 = parseFloat(loadMatch[2]);
    load15 = parseFloat(loadMatch[3]);
  }

  let memTotalMb = 0;
  let memUsedMb = 0;
  let memFreeMb = 0;

  const freeSection = output.split('===MEM===')[1]?.split('===STAT===')[0] || '';
  const memLineMatch = freeSection.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/i);
  if (memLineMatch) {
    memTotalMb = parseInt(memLineMatch[1], 10) || 0;
    memUsedMb = parseInt(memLineMatch[2], 10) || 0;
    memFreeMb = parseInt(memLineMatch[3], 10) || Math.max(0, memTotalMb - memUsedMb);
    if (memTotalMb > 8192) {
      memTotalMb = Math.round(memTotalMb / 1024);
      memUsedMb = Math.round(memUsedMb / 1024);
      memFreeMb = Math.round(memFreeMb / 1024);
    }
  } else {
    const totalK = freeSection.match(/MemTotal:\s+(\d+)\s+kB/i);
    const freeK = freeSection.match(/MemFree:\s+(\d+)\s+kB/i);
    const availK = freeSection.match(/MemAvailable:\s+(\d+)\s+kB/i);
    if (totalK) {
      memTotalMb = Math.round(parseInt(totalK[1], 10) / 1024);
      const avail = availK ? parseInt(availK[1], 10) : freeK ? parseInt(freeK[1], 10) : 0;
      memFreeMb = Math.round(avail / 1024);
      memUsedMb = Math.max(0, memTotalMb - memFreeMb);
    }
  }

  const fingerprint = hostFingerprint ? { hostFingerprint } : {};

  if (!loadMatch || memTotalMb <= 0) {
    return {
      status: 502,
      body: {
        success: false,
        durationMs,
        mode: 'offline',
        error: !loadMatch
          ? 'The device did not return a readable load average.'
          : 'The device did not return a readable memory report.',
        ...fingerprint,
      },
    };
  }

  const memPercent = Math.min(100, Math.max(0, Math.round((memUsedMb / memTotalMb) * 100)));
  const sample = parseProcStatCpu(output);
  const previous = samples.get(sampleKey);
  if (!sample) {
    return {
      status: 502,
      body: {
        success: false,
        durationMs,
        mode: 'offline',
        error: 'The device did not return a readable /proc/stat sample.',
        ...fingerprint,
      },
    };
  }
  samples.set(sampleKey, sample);
  const measuredCpu = previous ? cpuPercentBetween(previous, sample) : null;

  if (measuredCpu === null) {
    return {
      status: 200,
      body: {
        success: true,
        metric: null,
        pending: true,
        durationMs,
        mode: 'live',
        ...fingerprint,
      },
    };
  }

  const now = new Date();
  return {
    status: 200,
    body: {
      success: true,
      metric: {
        timestamp: Date.now(),
        timeLabel: now.toTimeString().split(' ')[0],
        cpuPercent: measuredCpu,
        memPercent,
        memUsedMb,
        memTotalMb,
        memFreeMb,
        load1,
        load5,
        load15,
      },
      durationMs,
      mode: 'live',
      ...fingerprint,
    },
  };
}
