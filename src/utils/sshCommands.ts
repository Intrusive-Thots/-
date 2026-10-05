export const TEST_COMMAND = 'uname -a; uptime; cat /etc/openwrt_release 2>/dev/null || true';

export const STATS_COMMAND = `
        echo "===RELEASE==="; cat /etc/openwrt_release 2>/dev/null; uname -a;
        echo "===UPTIME==="; uptime;
        echo "===FREE==="; free -m 2>/dev/null || free;
        echo "===DF==="; df -h;
        echo "===IFCONFIG==="; ifconfig;
        echo "===PINEAP==="; pineap get_status 2>/dev/null || echo "PINEAP_NOT_FOUND";
      `;

export const METRICS_COMMAND = `cat /proc/loadavg 2>/dev/null || uptime; echo "===MEM==="; free -m 2>/dev/null || cat /proc/meminfo; echo "===STAT==="; head -n 1 /proc/stat 2>/dev/null || true`;

export function safeScriptFilename(filename: unknown): string {
  const fallback = `payload_${Date.now()}.sh`;
  if (typeof filename !== 'string') return fallback;
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const base = filename.slice(slash + 1).replace(/[^A-Za-z0-9._-]/g, '');
  if (!base || base.startsWith('.') || base.length > 64) return fallback;
  return base;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Write a payload on the device and run it. The body is base64 so the shell command cannot be broken by quotes. */
export function wrapScriptCommand(command: string, filename: unknown): string {
  const scriptName = safeScriptFilename(filename);
  const remotePath = `/tmp/payloads/${scriptName}`;
  const invoke = scriptName.endsWith('.py') ? `python3 ${remotePath}` : remotePath;
  return `mkdir -p /tmp/payloads && printf '%s' '${encodeBase64(command)}' | base64 -d > ${remotePath} && chmod +x ${remotePath} && ${invoke}`;
}
