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
  hostFingerprint?: string;
}

const MAX_STREAM_CHARS = 200_000;
const previousCpuSamples = new Map<string, CpuSample>();

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
  const host = (config.host || '').trim();
  if (!host) throw new Error('A target host is required.');
  const port = Number(config.port ?? 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SSH port must be an integer from 1 to 65535.');
  }
  if (config.authType === 'key') {
    if (!config.privateKey?.trim()) throw new Error('Private key authentication requires a private key.');
  } else if (!config.password) {
    throw new Error('SSH requires a password. Save one in Config before connecting.');
  }
}

function runSSHCommand(
  config: SSHConfigBody,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number; hostFingerprint?: string }> {
  validateHardwareConfig(config);

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
        message: `SSH connection to ${config.host}:${config.port} verified.`,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      res.status(400).json({
        success: false,
        durationMs,
        error: err.message || 'SSH Connection failed',
        hint: 'Check that this Pineapple is reachable on the configured host and port, and that the password or key is correct.',
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

      if (!loadMatch || memTotalMb <= 0) {
        res.status(502).json({
          success: false,
          durationMs: Date.now() - startTime,
          mode: 'offline',
          error: !loadMatch
            ? 'The device did not return a readable load average.'
            : 'The device did not return a readable memory report.',
          hostFingerprint: result.hostFingerprint,
        });
        return;
      }

      const memPercent = Math.min(100, Math.max(0, Math.round((memUsedMb / memTotalMb) * 100)));
      const sampleKey = `${config.host || ''}:${config.port || 22}`;
      const sample = parseProcStatCpu(output);
      const previous = previousCpuSamples.get(sampleKey);
      if (!sample) {
        res.status(502).json({
          success: false,
          durationMs: Date.now() - startTime,
          mode: 'offline',
          error: 'The device did not return a readable /proc/stat sample.',
          hostFingerprint: result.hostFingerprint,
        });
        return;
      }
      previousCpuSamples.set(sampleKey, sample);
      const measuredCpu = previous ? cpuPercentBetween(previous, sample) : null;

      if (measuredCpu === null) {
        res.json({
          success: true,
          metric: null,
          pending: true,
          durationMs: Date.now() - startTime,
          mode: 'live',
          hostFingerprint: result.hostFingerprint,
        });
        return;
      }

      const now = new Date();
      const timeLabel = now.toTimeString().split(' ')[0];

      res.json({
        success: true,
        metric: {
          timestamp: Date.now(),
          timeLabel,
          cpuPercent: measuredCpu,
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
