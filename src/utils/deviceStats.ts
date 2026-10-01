import type { PineappleStats } from '../types';

export interface CpuSample {
  idle: number;
  total: number;
}

export function emptyDeviceStats(connected: boolean): PineappleStats {
  return {
    connected,
    model: 'Unknown',
    firmwareVersion: 'Unknown',
    uptime: 'Unknown',
    cpuLoad: 'Unknown',
    memoryUsage: 'Unknown',
    storageUsage: 'Unknown',
    interfaces: [],
    pineapStatus: {
      enabled: false,
      apPool: false,
      doghouse: false,
      karma: false,
      reconActive: false,
      activeSSIDs: 0,
      known: false,
    },
  };
}

function section(output: string, name: string): string {
  const match = output.match(new RegExp(`===${name}===\\s*([\\s\\S]*?)(?=\\n===|$)`));
  return match ? match[1].trim() : '';
}

function parseIdentity(text: string): { model: string; firmwareVersion: string } {
  let model = 'Unknown';
  let firmwareVersion = 'Unknown';
  const described = text.match(/DISTRIB_DESCRIPTION=['"]([^'"]+)['"]/i);
  const source = described?.[1] || text;
  const modelMatch = source.match(/WiFi Pineapple\s+[A-Za-z0-9]+(?:\s+[IVX0-9]+)?/i);
  if (modelMatch) model = modelMatch[0].trim();
  else if (/WiFi Pineapple/i.test(source)) model = 'WiFi Pineapple';

  const firmwareMatch = source.match(/v\d+(?:\.\d+)*(?:[^'"\n]*)/i);
  if (firmwareMatch) firmwareVersion = firmwareMatch[0].trim();
  return { model, firmwareVersion };
}

function parseUptime(text: string): { uptime: string; cpuLoad: string } {
  const line = text
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => /\bup\b/i.test(entry) || /load average/i.test(entry));
  const uptime = line ? line.replace(/\s+/g, ' ').slice(0, 120) : 'Unknown';
  const loadMatch = text.match(/load average:\s*([0-9.]+)[, ]\s*([0-9.]+)[, ]\s*([0-9.]+)/i);
  const cpuLoad = loadMatch ? `${loadMatch[1]}, ${loadMatch[2]}, ${loadMatch[3]}` : 'Unknown';
  return { uptime, cpuLoad };
}

function normalizeMemoryMb(total: number, used: number, free: number): { total: number; used: number; free: number } {
  // BusyBox `free` without -m reports kilobytes. Values above 8 GiB are not RAM on this device.
  if (total > 8192) {
    return {
      total: Math.round(total / 1024),
      used: Math.round(used / 1024),
      free: Math.round(free / 1024),
    };
  }
  return { total, used, free };
}

function parseMemory(text: string): string {
  const memLine = text.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/i);
  if (memLine) {
    const scaled = normalizeMemoryMb(
      parseInt(memLine[1], 10),
      parseInt(memLine[2], 10),
      parseInt(memLine[3], 10)
    );
    if (scaled.total > 0) return `${scaled.used}MB / ${scaled.total}MB`;
  }

  const totalK = text.match(/MemTotal:\s+(\d+)\s+kB/i);
  if (!totalK) return 'Unknown';
  const totalMb = Math.round(parseInt(totalK[1], 10) / 1024);
  const availableK = text.match(/MemAvailable:\s+(\d+)\s+kB/i);
  const freeK = text.match(/MemFree:\s+(\d+)\s+kB/i);
  const availableMb = Math.round(parseInt((availableK || freeK)?.[1] || '0', 10) / 1024);
  const usedMb = Math.max(0, totalMb - availableMb);
  return `${usedMb}MB / ${totalMb}MB`;
}

function parseStorage(text: string): string {
  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\d+%/.test(line));
  if (rows.length === 0) return 'Unknown';

  const preferred =
    rows.find((line) => /\/sd(?:\/|\s|$)/.test(line)) ||
    rows.find((line) => /overlay/.test(line)) ||
    rows[rows.length - 1];
  const match = preferred.match(/(\S+)\s+(\d+%)\s+(\S+)\s*$/);
  if (!match) return 'Unknown';
  return `${match[1]} free on ${match[3]}`;
}

export function parseInterfaces(text: string): PineappleStats['interfaces'] {
  const interfaces: PineappleStats['interfaces'] = [];
  const blocks = text.split(/\n(?=\S)/);
  for (const block of blocks) {
    const nameMatch = block.match(/^([A-Za-z][\w.-]*)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (name === 'lo' || name.startsWith('===')) continue;

    const mac =
      block.match(/HWaddr\s+([0-9A-Fa-f:]{11,17})/i)?.[1] ||
      block.match(/ether\s+([0-9A-Fa-f:]{11,17})/i)?.[1] ||
      '—';
    const ip =
      block.match(/inet addr:(\d+\.\d+\.\d+\.\d+)/)?.[1] ||
      block.match(/\binet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
    const flags = block.toUpperCase();
    const state: 'up' | 'down' | 'monitor' =
      flags.includes('MONITOR') || name.includes('mon') ? 'monitor' : /\bUP\b/.test(flags) ? 'up' : 'down';
    const type = state === 'monitor' ? 'Monitor' : name.startsWith('wlan') ? 'Wireless' : name.startsWith('eth') ? 'Ethernet' : 'Interface';
    interfaces.push({ name, type, mac, state, ...(ip ? { ip } : {}) });
  }
  return interfaces;
}

export function parsePineApStatus(text: string): PineappleStats['pineapStatus'] | null {
  if (!text || !/pineap/i.test(text)) return null;

  if (/PINEAP_NOT_FOUND/i.test(text) && !/status:\s*active/i.test(text)) {
    return {
      enabled: false,
      apPool: false,
      doghouse: false,
      karma: false,
      reconActive: false,
      activeSSIDs: 0,
      known: true,
    };
  }

  let enabled = /status:\s*active/i.test(text) || /suite started/i.test(text);
  if (/status:\s*stopped/i.test(text) || /suite stopped/i.test(text)) {
    enabled = /status:\s*active/i.test(text);
  }

  const ssidMatch = text.match(/(\d+)\s+SSIDs/i);
  return {
    enabled,
    apPool: /ap pool:\s*enabled/i.test(text),
    doghouse: /doghouse:\s*enabled/i.test(text),
    karma: /karma:\s*enabled/i.test(text),
    reconActive: /recon engine:\s*(scanning|active)/i.test(text),
    activeSSIDs: ssidMatch ? parseInt(ssidMatch[1], 10) : 0,
    known: true,
  };
}

export function parseDeviceStatsOutput(output: string): PineappleStats {
  const stats = emptyDeviceStats(true);
  const releaseText = section(output, 'RELEASE') || output;
  const uptimeText = section(output, 'UPTIME') || output;
  const memoryText = section(output, 'FREE') || section(output, 'MEM') || output;
  const storageText = section(output, 'DF') || output;
  const interfaceText = section(output, 'IFCONFIG') || output;
  const pineapText = section(output, 'PINEAP') || output;

  const identity = parseIdentity(releaseText);
  const uptime = parseUptime(uptimeText);
  stats.model = identity.model;
  stats.firmwareVersion = identity.firmwareVersion;
  stats.uptime = uptime.uptime;
  stats.cpuLoad = uptime.cpuLoad;
  stats.memoryUsage = parseMemory(memoryText);
  stats.storageUsage = parseStorage(storageText);
  stats.interfaces = parseInterfaces(interfaceText);
  const pineap = parsePineApStatus(pineapText);
  if (pineap) stats.pineapStatus = pineap;
  return stats;
}

export function parseProcStatCpu(text: string): CpuSample | null {
  const line = text.split('\n').find((entry) => /^cpu\s+/.test(entry));
  if (!line) return null;
  const parts = line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((value) => Number(value));
  if (parts.length < 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return { idle, total };
}

export function cpuPercentBetween(previous: CpuSample, next: CpuSample): number | null {
  const totalDelta = next.total - previous.total;
  const idleDelta = next.idle - previous.idle;
  if (totalDelta <= 0) return null;
  const busy = 1 - idleDelta / totalDelta;
  if (!Number.isFinite(busy)) return null;
  return Math.max(0, Math.min(100, Math.round(busy * 100)));
}
