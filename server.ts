import express from "express";
import crypto from "crypto";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Client as SSHClient } from "ssh2";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { type CpuSample } from "./src/utils/deviceStats.ts";
import { METRICS_COMMAND, STATS_COMMAND, TEST_COMMAND, wrapScriptCommand } from "./src/utils/sshCommands.ts";
import { interpretSystemMetrics } from "./src/utils/systemMetrics.ts";

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
      const result = await runSSHCommand(config, TEST_COMMAND);
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
      const finalCommand = asScript ? wrapScriptCommand(command, filename) : command;

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
      const result = await runSSHCommand(config, STATS_COMMAND);
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
      const result = await runSSHCommand(config, METRICS_COMMAND);
      const interpreted = interpretSystemMetrics(
        result.stdout || '',
        `${config.host || ''}:${config.port || 22}`,
        previousCpuSamples,
        Date.now() - startTime,
        result.hostFingerprint,
      );
      res.status(interpreted.status).json(interpreted.body);
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
      const prompt = `You write operational admin scripts for a WiFi Pineapple the operator already owns (Mark VII or earlier OpenWrt).
Write a clean, commented ${language === 'python' ? 'python3' : '/bin/sh'} script for this objective:

Goal: "${goal}"

The login shell is BusyBox ash. Do not use bash, arrays, process substitution, base64, airmon-ng, macchanger, hexdump, grep -A, grep -P, or python3 unless the operator asked for Python.
Prefer: pineap get_status (fall back to pineap /tmp/pineap.conf get_status), iw, iwinfo, ifconfig, uci show, logread, dmesg, df, free, uptime, ps.
Do not add deauth, handshake capture, cracking, or evil-twin steps.

Requirements:
1. Provide ONLY executable code inside a markdown code block (\`\`\`bash or \`\`\`python).
2. Check that a command exists before calling it.
3. Add short comments.
4. Start shell scripts with #!/bin/sh.`;

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
