export const TEST_COMMAND = 'uname -a; uptime; cat /etc/openwrt_release 2>/dev/null || true';

export const STATS_COMMAND = `
        echo "===RELEASE==="; cat /etc/openwrt_release 2>/dev/null; uname -a;
        echo "===UPTIME==="; uptime;
        echo "===FREE==="; free -m 2>/dev/null || free;
        echo "===DF==="; df -h 2>/dev/null || df;
        echo "===IFCONFIG==="; ifconfig;
        echo "===PINEAP==="; pineap get_status 2>/dev/null || pineap status 2>/dev/null || pineap /tmp/pineap.conf get_status 2>/dev/null || echo "PINEAP_NOT_FOUND";
      `;

export const METRICS_COMMAND = `cat /proc/loadavg 2>/dev/null || uptime; echo "===MEM==="; free -m 2>/dev/null || cat /proc/meminfo; echo "===STAT==="; head -n 1 /proc/stat 2>/dev/null || true`;

/** Read-only PineAP status. Mark VII accepts `pineap get_status`; 6th-gen often needs the config path. */
export const PINEAP_STATUS_COMMAND =
  'pineap get_status 2>/dev/null || pineap status 2>/dev/null || pineap /tmp/pineap.conf get_status 2>/dev/null || uci show pineap 2>/dev/null || echo PINEAP_NOT_FOUND';

/** Start uses the verbs this app already sends, then the documented 6th-gen names if those verbs are rejected. */
export const PINEAP_START_COMMAND =
  'if ! command -v pineap >/dev/null 2>&1; then echo "pineap not found"; exit 1; fi; if pineap get_status >/dev/null 2>&1; then pineap enable 2>/dev/null; pineap start 2>/dev/null; pineap beacon_response enable 2>/dev/null; pineap beacon_responses on 2>/dev/null; pineap ap_pool enable 2>/dev/null; pineap broadcast_pool on 2>/dev/null; pineap get_status; elif [ -f /tmp/pineap.conf ]; then pineap /tmp/pineap.conf karma on; pineap /tmp/pineap.conf beacon_responses on; pineap /tmp/pineap.conf broadcast_pool on; pineap /tmp/pineap.conf get_status; else pineap karma on 2>/dev/null; pineap start 2>/dev/null; pineap get_status 2>/dev/null || pineap help 2>&1 | head -n 20; fi';

export const PINEAP_STOP_COMMAND =
  'if ! command -v pineap >/dev/null 2>&1; then echo "pineap not found"; exit 1; fi; pineap disable 2>/dev/null; pineap stop 2>/dev/null; pineap karma off 2>/dev/null; if [ -f /tmp/pineap.conf ]; then pineap /tmp/pineap.conf karma off 2>/dev/null; pineap /tmp/pineap.conf get_status 2>/dev/null; fi; pineap get_status 2>/dev/null || pineap status 2>/dev/null || echo stopped';

/** Radios that exist on OpenWrt. airmon-ng and macchanger are not part of the Pineapple image. */
export const WIFI_RADIOS_COMMAND =
  'iw dev 2>/dev/null || true; echo "===IWINFO==="; iwinfo 2>/dev/null || true; echo "===IFCONFIG==="; ifconfig';

export function safeScriptFilename(filename: unknown): string {
  const fallback = `payload_${Date.now()}.sh`;
  if (typeof filename !== 'string') return fallback;
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const base = filename.slice(slash + 1).replace(/[^A-Za-z0-9._-]/g, '');
  if (!base || base.startsWith('.') || base.length > 64) return fallback;
  return base;
}

const PRINTF_CHUNK_BYTES = 1500;

/** BusyBox printf '%b' octal. Pineapple ash has no base64 applet. */
export function encodePrintfOctal(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += '\\' + byte.toString(8).padStart(3, '0');
  return out;
}

/** Commands that write `body` to an already-safe remote path with printf, never base64. */
export function printfWriteCommands(remotePath: string, body: string): string[] {
  const text = body.endsWith('\n') ? body : `${body}\n`;
  const bytes = new TextEncoder().encode(text);
  const commands = [`: > ${remotePath}`];
  if (bytes.length === 0) return commands;
  for (let offset = 0; offset < bytes.length; offset += PRINTF_CHUNK_BYTES) {
    const slice = bytes.subarray(offset, offset + PRINTF_CHUNK_BYTES);
    commands.push(`printf '%b' '${encodePrintfOctal(slice)}' >> ${remotePath}`);
  }
  return commands;
}

/**
 * Write a payload on the device and run it.
 * The body is octal so quotes in the script cannot break ash, and no base64 binary is required.
 */
export function wrapScriptCommand(command: string, filename: unknown): string {
  const scriptName = safeScriptFilename(filename);
  const remotePath = `/tmp/payloads/${scriptName}`;
  const invoke = scriptName.endsWith('.py') ? `python3 ${remotePath}` : `sh ${remotePath}`;
  return [`mkdir -p /tmp/payloads`, ...printfWriteCommands(remotePath, command), `chmod +x ${remotePath}`, invoke].join(
    ' && '
  );
}
