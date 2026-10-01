import express from "express";
import crypto from "crypto";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Client as SSHClient } from "ssh2";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { cpuPercentBetween, parseProcStatCpu, type CpuSample } from "./src/utils/deviceStats.ts";

dotenv.config();

interface SSHConfigBody {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  timeoutMs?: number;
  useSimulation?: boolean;
  hostFingerprint?: string;
}

const MAX_STREAM_CHARS = 200_000;
const previousCpuSamples = new Map<string, CpuSample>();

// Simulated data generator for offline/demo testing
let simulatedCrontab = `# OpenWrt root crontab on WiFi Pineapple Mark VII
# m h dom mon dow command
*/30 * * * * /root/payloads/recon_sweep.sh >> /tmp/recon_sweep.log 2>&1 # WIFIPINEAPPLE_JOB_preset_recon
`;

let simCpuUsage = 24;
let simMemUsedMb = 118;
let simLoad1 = 0.22;
let simLoad5 = 0.25;
let simLoad15 = 0.19;
let simulatedPineapEnabled = true;

function simulatedIfconfig(): string {
  return `eth0      Link encap:Ethernet  HWaddr 00:13:37:A4:B2:10  
          inet addr:192.168.1.150  Bcast:192.168.1.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1

wlan0     Link encap:Ethernet  HWaddr 00:13:37:A4:B2:11  
          inet addr:172.16.42.1  Bcast:172.16.42.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1

wlan1mon  Link encap:Ethernet  HWaddr 00:13:37:A4:B2:12  
          UP BROADCAST RUNNING MONITOR  MTU:1500  Metric:1

lo        Link encap:Local Loopback  
          inet addr:127.0.0.1  Mask:255.0.0.0
          UP LOOPBACK RUNNING  MTU:65536  Metric:1`;
}

function simulatedPineapReport(): string {
  const enabled = simulatedPineapEnabled;
  return `PineAP Status: ${enabled ? 'ACTIVE' : 'STOPPED'}
SSID Pool: 42 SSIDs loaded
Karma: ${enabled ? 'ENABLED' : 'DISABLED'}
AP Pool: ${enabled ? 'ENABLED' : 'DISABLED'}
Doghouse: DISABLED
Recon Engine: IDLE`;
}

function simulatedStatsReport(): string {
  const memFree = 256 - simMemUsedMb;
  return `===RELEASE===
DISTRIB_ID='OpenWrt'
DISTRIB_RELEASE='21.02.3'
DISTRIB_DESCRIPTION='WiFi Pineapple Mark VII Firmware v2.1.2 (Hak5 OS)'
Linux WiFiPineapple 5.4.188
===UPTIME===
04:12:33 up 4:12, load average: ${simLoad1.toFixed(2)}, ${simLoad5.toFixed(2)}, ${simLoad15.toFixed(2)}
===FREE===
              total        used        free      shared  buff/cache   available
Mem:            256         ${simMemUsedMb}          ${memFree}           4          40         ${memFree}
===DF===
Filesystem                Size      Used Available Use% Mounted on
/dev/root                16.0M     12.4M      3.6M  78% /
/dev/sda1                29.8G      2.1G     27.7G   7% /sd
===IFCONFIG===
${simulatedIfconfig()}
===PINEAP===
${simulatedPineapReport()}`;
}

function applySimulatedPineap(trimmed: string): { stdout: string; stderr: string; exitCode: number } {
  const stop = /\b(disable|stop)\b/.test(trimmed);
  const start = /\b(enable|start)\b/.test(trimmed);
  if (stop && !start) simulatedPineapEnabled = false;
  else if (start) simulatedPineapEnabled = true;
  const status = simulatedPineapReport();
  if (stop && !start) {
    return {
      stdout: `[-] PineAP suite stopped.\n[-] Broadcaster disabled.\n${status}`,
      stderr: '',
      exitCode: 0,
    };
  }
  if (start) {
    return {
      stdout: `[+] PineAP suite started successfully.\n[+] Beacon broadcaster active on 2.4GHz channel 6.\n${status}`,
      stderr: '',
      exitCode: 0,
    };
  }
  return { stdout: status, stderr: '', exitCode: 0 };
}

function safeScriptFilename(filename: unknown): string {
  const fallback = `payload_${Date.now()}.sh`;
  if (typeof filename !== 'string') return fallback;
  const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '');
  if (!base || base.startsWith('.') || base.length > 64) return fallback;
  return base;
}

function appendCapped(current: string, chunk: string): string {
  if (current.length >= MAX_STREAM_CHARS) return current;
  const next = current + chunk;
  if (next.length <= MAX_STREAM_CHARS) return next;
  return `${next.slice(0, MAX_STREAM_CHARS)}\n[output truncated]`;
}

function fingerprintsMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateHardwareConfig(config: SSHConfigBody): void {
  if (config.useSimulation) return;
  const host = (config.host || '').trim();
  if (!host) throw new Error('A target host is required.');
  const port = Number(config.port ?? 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SSH port must be an integer from 1 to 65535.');
  }
  if (config.authType === 'key') {
    if (!config.privateKey?.trim()) throw new Error('Private key authentication requires a private key.');
  } else if (!config.password) {
    throw new Error('Hardware SSH requires a password. Turn on simulation to work without a device.');
  }
}

function getSimulatedTelemetryPoint() {
  // Drift CPU with smooth random walk clamped 6% - 92%
  const deltaCpu = (Math.random() - 0.49) * 8;
  simCpuUsage = Math.max(6, Math.min(92, Math.round(simCpuUsage + deltaCpu)));

  // Drift RAM slowly around 118MB / 256MB
  const deltaMem = (Math.random() - 0.5) * 3;
  simMemUsedMb = Math.max(92, Math.min(180, Math.round(simMemUsedMb + deltaMem)));
  const memTotalMb = 256;
  const memPercent = Math.round((simMemUsedMb / memTotalMb) * 100);
  const memFreeMb = memTotalMb - simMemUsedMb;

  simLoad1 = Number(((simCpuUsage / 100) * 0.9 + (Math.random() * 0.08 - 0.04)).toFixed(2));
  simLoad5 = Number((simLoad1 * 0.88 + 0.04).toFixed(2));
  simLoad15 = 0.18;

  const now = new Date();
  const timeLabel = now.toTimeString().split(' ')[0];

  return {
    timestamp: Date.now(),
    timeLabel,
    cpuPercent: simCpuUsage,
    memPercent,
    memUsedMb: simMemUsedMb,
    memTotalMb,
    memFreeMb,
    load1: simLoad1,
    load5: simLoad5,
    load15: simLoad15,
  };
}

function getSimulatedOutput(command: string): { stdout: string; stderr: string; exitCode: number } {
  const trimmed = command.trim();

  if (trimmed.includes('===UPTIME===') || trimmed.includes('===RELEASE===') || trimmed.includes('===FREE===')) {
    return { stdout: simulatedStatsReport(), stderr: '', exitCode: 0 };
  }

  // Crontab inspection & operations
  if (trimmed === 'crontab -l' || trimmed.includes('cat /etc/crontabs/root')) {
    return {
      stdout: simulatedCrontab || '# No active crontabs for root\n',
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('/etc/init.d/cron')) {
    if (trimmed.includes('status')) {
      return {
        stdout: `running\nPID: 1208 /usr/sbin/crond -c /etc/crontabs -l 5`,
        stderr: '',
        exitCode: 0,
      };
    }
    if (trimmed.includes('restart') || trimmed.includes('start') || trimmed.includes('enable')) {
      return {
        stdout: `[+] Enabling and starting OpenWrt cron daemon...\n[+] crond service started (PID: 1244).`,
        stderr: '',
        exitCode: 0,
      };
    }
  }

  // Crontab update simulation
  if (trimmed.includes('/etc/crontabs/root') || (trimmed.includes('crontab -') && !trimmed.includes('crontab -l'))) {
    if (trimmed.includes('grep -v')) {
      // simulate removing a line
      const match = trimmed.match(/WIFIPINEAPPLE_JOB_([a-zA-Z0-9_-]+)/);
      if (match) {
        const jobId = match[1];
        simulatedCrontab = simulatedCrontab
          .split('\n')
          .filter((line) => !line.includes(`WIFIPINEAPPLE_JOB_${jobId}`))
          .join('\n');
      }
      return {
        stdout: `[+] Crontab updated successfully.`,
        stderr: '',
        exitCode: 0,
      };
    }
    
    // Add job to crontab
    const match = trimmed.match(/echo "([^"]+)" >> \/etc\/crontabs\/root/);
    if (match) {
      simulatedCrontab += `\n${match[1]}\n`;
    }
    return {
      stdout: `[+] Job added to /etc/crontabs/root.\n[+] Cron daemon reloaded.`,
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('logread') && (trimmed.includes('cron') || trimmed.includes('CRON'))) {
    return {
      stdout: `[INFO] crond[1208]: (root) CMD (/root/payloads/recon_sweep.sh >> /tmp/recon_sweep.log 2>&1)
[INFO] crond[1208]: (root) CMD (echo "[$(date)] WiFi Pineapple health check OK" >> /tmp/health.log)
[INFO] crond[1208]: OpenWrt cron daemon active, polling every 60s`,
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('pineap')) {
    return applySimulatedPineap(trimmed);
  }

  if (trimmed === 'ifconfig' || trimmed.includes('ifconfig')) {
    return {
      stdout: simulatedIfconfig(),
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('airmon-ng') || trimmed.includes('iwconfig') || trimmed.includes('iw dev')) {
    return {
      stdout: `PHY\tInterface\tDriver\t\tChipset
phy0\twlan0\t\tath9k\t\tAtheros AR9271
phy1\twlan1mon\tath9k_htc\tAtheros AR9271 (Monitor Mode Active)
phy2\twlan2\t\trt2800usb\tRalink RT5370`,
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('uname') || trimmed.includes('uptime') || trimmed.includes('cat /etc/openwrt_release')) {
    return {
      stdout: `Linux WiFiPineapple 5.4.188 #0 SMP PREEMPT OpenWrt 21.02.3
Uptime: 04:12:33 up 4 hours, 12 mins, load average: 0.18, 0.22, 0.15
WiFi Pineapple Mark VII Firmware v2.1.2 (Hak5 OS)`,
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('free') || trimmed.includes('df -h')) {
    return {
      stdout: `Mem: 256MB Total, 118MB Used, 138MB Free, 12MB Buffers
Swap: 512MB Total, 0MB Used, 512MB Free
Filesystem                Size      Used Available Use% Mounted on
/dev/root                16.0M     12.4M      3.6M  78% /
/dev/sda1 (SD Card)      29.8G      2.1G     27.7G   7% /sd`,
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('logread') || trimmed.includes('dmesg')) {
    return {
      stdout: `[INFO] PineAP: Station 4A:32:9F:88:B1:12 connected to rogue AP 'Free_Guest_WiFi'
[INFO] PineAP: Probe request received for 'Home_Network_5G' from 8C:85:90:12:34:56 (RSSI: -58dBm)
[INFO] PineAP: Added 'Home_Network_5G' to target SSID pool
[INFO] hostapd: wlan0: STA 4a:32:9f:88:b1:12 IEEE 802.11: associated
[INFO] dnsmasq-dhcp[1420]: DHCPREQUEST(wlan0) 172.16.42.105 4a:32:9f:88:b1:12
[INFO] dnsmasq-dhcp[1420]: DHCPACK(wlan0) 172.16.42.105 4a:32:9f:88:b1:12 android-smartphone`,
      stderr: '',
      exitCode: 0,
    };
  }

  if (trimmed.includes('uci show')) {
    return {
      stdout: `wireless.radio0=wifi-device
wireless.radio0.type='mac80211'
wireless.radio0.channel='6'
wireless.radio0.band='2g'
wireless.radio0.htmode='HT20'
wireless.radio0.disabled='0'
wireless.default_radio0=wifi-iface
wireless.default_radio0.device='radio0'
wireless.default_radio0.network='lan'
wireless.default_radio0.mode='ap'
wireless.default_radio0.ssid='WiFi_Pineapple_B210'`,
      stderr: '',
      exitCode: 0,
    };
  }

  // Generic custom script / python / bash output simulation
  return {
    stdout: `[+] Executing command on WiFi Pineapple: ${trimmed}\n[+] Output:\nCommand completed successfully on device target (Simulated mode).`,
    stderr: '',
    exitCode: 0,
  };
}

// Function to run SSH command
function runSSHCommand(
  config: SSHConfigBody,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number; hostFingerprint?: string }> {
  validateHardwareConfig(config);

  if (config.useSimulation) {
    return Promise.resolve(getSimulatedOutput(command));
  }

  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let stdout = '';
    let stderr = '';
    let isSettled = false;
    let observedFingerprint: string | undefined;
    let hostMismatch = false;

    const timeoutLimit = config.timeoutMs ? Math.max(config.timeoutMs, 10000) : 30000;
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try {
          conn.end();
        } catch (_) {}
        reject(new Error(`Command timed out after ${Math.round(timeoutLimit / 1000)} seconds.`));
      }
    }, timeoutLimit);

    const cleanup = () => {
      clearTimeout(timer);
      isSettled = true;
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          if (!isSettled) {
            cleanup();
            try {
              conn.end();
            } catch (_) {}
            return reject(err);
          }
          return;
        }

        stream.on('close', (code: number) => {
          if (!isSettled) {
            cleanup();
            try {
              conn.end();
            } catch (_) {}
            resolve({ stdout, stderr, exitCode: code ?? 0, hostFingerprint: observedFingerprint });
          }
        });

        stream.on('data', (data: Buffer) => {
          stdout = appendCapped(stdout, data.toString('utf-8'));
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr = appendCapped(stderr, data.toString('utf-8'));
        });
      });
    });

    conn.on('error', (err) => {
      if (!isSettled) {
        cleanup();
        try {
          conn.end();
        } catch (_) {}
        if (hostMismatch) {
          reject(new Error(`SSH host key for ${config.host}:${config.port || 22} does not match the saved pin. The connection was refused. Forget the trusted host key in Config if you replaced this device.`));
          return;
        }
        reject(err);
      }
    });

    const connectOptions: any = {
      host: config.host || '172.16.42.1',
      port: config.port || 22,
      username: config.username || 'root',
      readyTimeout: config.timeoutMs || 8000,
      hostHash: 'sha256',
      hostVerifier: (fingerprint: string) => {
        observedFingerprint = fingerprint;
        if (config.hostFingerprint && !fingerprintsMatch(config.hostFingerprint, fingerprint)) {
          hostMismatch = true;
          return false;
        }
        return true;
      },
    };

    if (config.authType === 'key' && config.privateKey) {
      connectOptions.privateKey = config.privateKey;
      if (config.passphrase) connectOptions.passphrase = config.passphrase;
    } else if (config.password) {
      connectOptions.password = config.password;
    }

    try {
      conn.connect(connectOptions);
    } catch (err) {
      if (!isSettled) {
        cleanup();
        reject(err);
      }
    }
  });
}

async function startApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const PORT = 3000;

  // Test SSH Connection
  app.post('/api/ssh/test', async (req, res) => {
    const startTime = Date.now();
    const config: SSHConfigBody = req.body;

    try {
      const testCmd = 'uname -a; uptime; cat /etc/openwrt_release 2>/dev/null || true';
      const result = await runSSHCommand(config, testCmd);
      const durationMs = Date.now() - startTime;

      res.json({
        success: true,
        durationMs,
        stdout: result.stdout,
        hostFingerprint: result.hostFingerprint,
        message: config.useSimulation
          ? 'Connected to Simulated WiFi Pineapple Target.'
          : `SSH Connection to ${config.host}:${config.port} verified!`,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      res.status(400).json({
        success: false,
        durationMs,
        error: err.message || 'SSH Connection failed',
        hint: 'If your WiFi Pineapple is on a local subnet (e.g. 172.16.42.1), enable Simulation Mode or verify network route/port forwarding.',
      });
    }
  });

  // Execute Command or Script
  app.post('/api/ssh/exec', async (req, res) => {
    const startTime = Date.now();
    const { config, command, asScript, filename } = req.body;

    if (!command || typeof command !== 'string') {
      res.status(400).json({ error: 'Command string is required.' });
      return;
    }

    try {
      let finalCommand = command;
      if (asScript) {
        const scriptName = safeScriptFilename(filename);
        const base64Content = Buffer.from(command).toString('base64');
        const remotePath = `/tmp/payloads/${scriptName}`;
        const invoke = scriptName.endsWith('.py') ? `python3 ${remotePath}` : remotePath;
        finalCommand = `mkdir -p /tmp/payloads && printf '%s' '${base64Content}' | base64 -d > ${remotePath} && chmod +x ${remotePath} && ${invoke}`;
      }

      const result = await runSSHCommand(config, finalCommand);
      const durationMs = Date.now() - startTime;

      res.json({
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs,
        hostFingerprint: result.hostFingerprint,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      res.status(500).json({
        success: false,
        error: err.message || 'Execution error',
        durationMs,
      });
    }
  });

  // Device Stats Query
  app.post('/api/ssh/stats', async (req, res) => {
    const config: SSHConfigBody = req.body;
    try {
      const multiCmd = `
        echo "===RELEASE==="; cat /etc/openwrt_release 2>/dev/null; uname -a;
        echo "===UPTIME==="; uptime;
        echo "===FREE==="; free -m 2>/dev/null || free;
        echo "===DF==="; df -h;
        echo "===IFCONFIG==="; ifconfig;
        echo "===PINEAP==="; pineap get_status 2>/dev/null || echo "PINEAP_NOT_FOUND";
      `;
      const result = await runSSHCommand(config, multiCmd);
      res.json({ success: true, output: result.stdout, hostFingerprint: result.hostFingerprint });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Dedicated Real-Time CPU & Memory Metrics Endpoint for D3 Widgets
  app.post('/api/ssh/system-metrics', async (req, res) => {
    const config: SSHConfigBody = req.body;
    const startTime = Date.now();

    if (config.useSimulation) {
      const metric = getSimulatedTelemetryPoint();
      res.json({
        success: true,
        metric,
        durationMs: Date.now() - startTime,
        mode: 'simulated',
      });
      return;
    }

    try {
      const cmd = `cat /proc/loadavg 2>/dev/null || uptime; echo "===MEM==="; free -m 2>/dev/null || cat /proc/meminfo; echo "===STAT==="; head -n 1 /proc/stat 2>/dev/null || true`;
      const result = await runSSHCommand(config, cmd);
      const output = result.stdout || '';

      // Parse loadavg (e.g. 0.18 0.22 0.15 1/48 1824)
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
          const avail = availK ? parseInt(availK[1], 10) : (freeK ? parseInt(freeK[1], 10) : 0);
          memFreeMb = Math.round(avail / 1024);
          memUsedMb = Math.max(0, memTotalMb - memFreeMb);
        }
      }

      const memPercent = Math.min(100, Math.max(0, Math.round((memUsedMb / (memTotalMb || 1)) * 100)));
      const sampleKey = `${config.host || ''}:${config.port || 22}`;
      const sample = parseProcStatCpu(output);
      const previous = previousCpuSamples.get(sampleKey);
      if (sample) previousCpuSamples.set(sampleKey, sample);
      const measuredCpu = sample && previous ? cpuPercentBetween(previous, sample) : null;
      // The first sample has no delta. Use load as a stand-in once, without random jitter.
      const cpuPercent = measuredCpu ?? Math.min(100, Math.max(0, Math.round(Math.min(load1, 1) * 100)));

      const now = new Date();
      const timeLabel = now.toTimeString().split(' ')[0];

      res.json({
        success: true,
        metric: {
          timestamp: Date.now(),
          timeLabel,
          cpuPercent,
          memPercent,
          memUsedMb,
          memTotalMb,
          memFreeMb,
          load1,
          load5,
          load15,
        },
        durationMs: Date.now() - startTime,
        mode: 'live',
        hostFingerprint: result.hostFingerprint,
      });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        durationMs: Date.now() - startTime,
        mode: 'offline',
        error: err.message || 'SSH connection unavailable',
      });
    }
  });

  // AI Generator Endpoint using Gemini
  app.post('/api/ai/generate-payload', async (req, res) => {
    const { goal, model, language } = req.body;
    if (!goal) {
      res.status(400).json({ error: 'Goal prompt is required.' });
      return;
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(400).json({
          error: 'GEMINI_API_KEY is not configured in environment variables.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are an expert wireless security researcher and Hak5 WiFi Pineapple specialist (Mark VII / TETRA / NANO OpenWrt OS).
Write a production-ready, clean, safe, well-commented ${language || 'bash'} script for a WiFi Pineapple device to achieve the following objective:

Goal: "${goal}"

Hardware context: WiFi Pineapple Mark VII / OpenWrt Linux system.
Key CLI tools available: pineap, airmon-ng, airodump-ng, iw, ifconfig, uci, opkg, logread, python3.

Requirements:
1. Provide ONLY executable code inside a markdown code block (\`\`\`bash or \`\`\`python).
2. Include error checking (e.g. check if interfaces or commands exist).
3. Add explanatory inline comments.
4. Keep script safe, clean, and structured.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text || '';
      res.json({ success: true, text });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini API call failed.' });
    }
  });

  // AI Output Analysis Endpoint
  app.post('/api/ai/analyze-log', async (req, res) => {
    const { command, stdout, stderr, exitCode } = req.body;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(400).json({
          error: 'GEMINI_API_KEY is not configured in environment variables.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a cybersecurity expert analyzing the output of a WiFi Pineapple command execution over SSH.

Executed Command: \`${command}\`
Exit Code: ${exitCode}

STDOUT:
\`\`\`
${stdout || '(empty)'}
\`\`\`

STDERR:
\`\`\`
${stderr || '(empty)'}
\`\`\`

Please analyze this execution output and provide:
1. High-level Summary: What happened during execution?
2. Key Findings / Network Intelligence: Important IP addresses, MAC addresses, SSIDs, interface states, or logs discovered.
3. Errors / Debugging Advice: If any error occurred, explain how to resolve it on OpenWrt / WiFi Pineapple.
4. Next Action Steps: 2-3 recommended follow-up SSH commands or tweaks.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      res.json({ success: true, analysis: response.text || 'No analysis generated.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini API analysis failed.' });
    }
  });

  // Serve static assets or Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ success: false, error: 'Request body is not valid JSON.' });
      return;
    }
    next(err);
  });

  // Loopback only. HOST=0.0.0.0 exposes the unauthenticated SSH API on the network.
  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => {
    console.log(`WiFi Pineapple SSH Controller running on http://${HOST}:${PORT}`);
  });
}

startApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
