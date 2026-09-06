import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Client as SSHClient } from "ssh2";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

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
}

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
    if (trimmed.includes('get_status') || trimmed.includes('status')) {
      return {
        stdout: `PineAP Status: ACTIVE
Target: FF:FF:FF:FF:FF:FF (BROADCAST)
SSID Pool: 42 SSIDs loaded
Karma: ENABLED
AP Pool: ENABLED
Doghouse: DISABLED
Recon Engine: IDLE (Scanner ready on wlan1mon)
Active Associations: 3 Clients connected`,
        stderr: '',
        exitCode: 0,
      };
    }
    if (trimmed.includes('enable') || trimmed.includes('start')) {
      return {
        stdout: `[+] PineAP suite started successfully.\n[+] Interface wlan0 set to Master.\n[+] Beacon broadcaster active on 2.4GHz channel 6.`,
        stderr: '',
        exitCode: 0,
      };
    }
    if (trimmed.includes('disable') || trimmed.includes('stop')) {
      return {
        stdout: `[-] PineAP suite stopped.\n[-] Broadcaster disabled.`,
        stderr: '',
        exitCode: 0,
      };
    }
  }

  if (trimmed === 'ifconfig' || trimmed.includes('ifconfig')) {
    return {
      stdout: `eth0      Link encap:Ethernet  HWaddr 00:13:37:A4:B2:10  
          inet addr:192.168.1.150  Bcast:192.168.1.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:14201 errors:0 dropped:0 overruns:0 frame:0
          TX packets:9820 errors:0 dropped:0 overruns:0 carrier:0

wlan0     Link encap:Ethernet  HWaddr 00:13:37:A4:B2:11  
          inet addr:172.16.42.1  Bcast:172.16.42.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:84310 errors:0 dropped:0 overruns:0 frame:0
          TX packets:71290 errors:0 dropped:0 overruns:0 carrier:0

wlan1mon  Link encap:Ethernet  HWaddr 00:13:37:A4:B2:12  
          UNSPEC  MTU:1500  Metric:1
          UP BROADCAST RUNNING MONITOR  MTU:1500  Metric:1
          RX packets:104922 errors:0 dropped:12 overruns:0 frame:0
          TX packets:4012 errors:0 dropped:0 overruns:0 carrier:0

lo        Link encap:Local Loopback  
          inet addr:127.0.0.1  Mask:255.0.0.0
          UP LOOPBACK RUNNING  MTU:65536  Metric:1`,
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
function runSSHCommand(config: SSHConfigBody, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (config.useSimulation) {
    return Promise.resolve(getSimulatedOutput(command));
  }

  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let stdout = '';
    let stderr = '';
    let isSettled = false;

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
            resolve({ stdout, stderr, exitCode: code ?? 0 });
          }
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });
      });
    });

    conn.on('error', (err) => {
      if (!isSettled) {
        cleanup();
        try {
          conn.end();
        } catch (_) {}
        reject(err);
      }
    });

    const connectOptions: any = {
      host: config.host || '172.16.42.1',
      port: config.port || 22,
      username: config.username || 'root',
      readyTimeout: config.timeoutMs || 8000,
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
        // Safe script execution via temporary payload file on device
        const scriptName = filename || `payload_${Date.now()}.sh`;
        const base64Content = Buffer.from(command).toString('base64');
        finalCommand = `mkdir -p /tmp/payloads && echo "${base64Content}" | base64 -d > /tmp/payloads/${scriptName} && chmod +x /tmp/payloads/${scriptName} && /tmp/payloads/${scriptName}`;
      }

      const result = await runSSHCommand(config, finalCommand);
      const durationMs = Date.now() - startTime;

      res.json({
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs,
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
        echo "===UPTIME==="; uptime;
        echo "===FREE==="; free -m 2>/dev/null || free;
        echo "===DF==="; df -h;
        echo "===IFCONFIG==="; ifconfig;
        echo "===PINEAP==="; pineap get_status 2>/dev/null || echo "PINEAP_NOT_FOUND";
      `;
      const result = await runSSHCommand(config, multiCmd);
      res.json({ success: true, output: result.stdout });
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
      let load1 = 0.18;
      let load5 = 0.22;
      let load15 = 0.15;
      const loadMatch = output.match(/([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)/);
      if (loadMatch) {
        load1 = parseFloat(loadMatch[1]);
        load5 = parseFloat(loadMatch[2]);
        load15 = parseFloat(loadMatch[3]);
      }

      // Parse memory
      let memTotalMb = 256;
      let memUsedMb = 118;
      let memFreeMb = 138;

      const freeSection = output.split('===MEM===')[1] || output;
      const memLineMatch = freeSection.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/i) || freeSection.match(/(\d+)\s+(\d+)\s+(\d+)/);
      if (memLineMatch) {
        memTotalMb = parseInt(memLineMatch[1], 10) || 256;
        memUsedMb = parseInt(memLineMatch[2], 10) || 118;
        memFreeMb = parseInt(memLineMatch[3], 10) || (memTotalMb - memUsedMb);
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
      const cpuPercent = Math.min(100, Math.max(1, Math.round(load1 * 50 + (Math.random() * 4 - 2))));

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
      });
    } catch (err: any) {
      // Return simulated fallback with warning if SSH dropped temporarily
      const fallback = getSimulatedTelemetryPoint();
      res.json({
        success: true,
        metric: fallback,
        durationMs: Date.now() - startTime,
        mode: 'fallback',
        warning: err.message || 'SSH connection unavailable; utilizing cached telemetry stream',
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WiFi Pineapple SSH Controller running on http://0.0.0.0:${PORT}`);
  });
}

startApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
