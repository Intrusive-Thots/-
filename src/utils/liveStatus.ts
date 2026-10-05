import { parsePineApStatus } from './deviceStats';

export const LIVE_STATUS_COMMAND = `
echo "===UPTIME==="
uptime 2>/dev/null || true
echo "===PINEAP==="
pineap get_status 2>/dev/null || pineap status 2>/dev/null || pineap /tmp/pineap.conf get_status 2>/dev/null || uci show pineap 2>/dev/null || echo PINEAP_NOT_FOUND
echo "===SSIDS==="
pineap list_ssids 2>/dev/null || pineap /tmp/pineap.conf list_ssids 2>/dev/null || true
uci show pineap 2>/dev/null | grep -i ssid || true
echo "===CLIENTS==="
if [ -f /tmp/dhcp.leases ]; then cat /tmp/dhcp.leases; else echo NO_LEASES; fi
echo "===STATIONS==="
if command -v iw >/dev/null 2>&1; then
  iw dev 2>/dev/null | while read -r a b _; do
    if [ "$a" = "Interface" ] && [ -n "$b" ]; then
      echo "IFACE $b"
      iw dev "$b" station dump 2>/dev/null || true
    fi
  done
fi
echo "===PROCS==="
ps w 2>/dev/null || ps
echo "===CRON==="
if [ -f /etc/crontabs/root ]; then cat /etc/crontabs/root; else crontab -l 2>/dev/null || echo NO_CRONTAB; fi
echo "===CRONSVC==="
if [ -x /etc/init.d/cron ]; then
  if /etc/init.d/cron enabled >/dev/null 2>&1; then echo enabled; else echo disabled; fi
else
  echo missing
fi
echo "===SURVEY==="
if [ -f /tmp/pinesshremo-survey.pid ]; then
  pid=$(cat /tmp/pinesshremo-survey.pid 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo RUNNING; else echo IDLE; fi
else
  echo IDLE
fi
if [ -f /tmp/pinesshremo-survey.out ]; then tail -n 40 /tmp/pinesshremo-survey.out; fi
`.trim();

export const SURVEY_START_COMMAND = `
if [ -f /tmp/pinesshremo-survey.pid ]; then
  pid=$(cat /tmp/pinesshremo-survey.pid 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo already-running; exit 0; fi
fi
rm -f /tmp/pinesshremo-survey.out
(
  if command -v iw >/dev/null 2>&1; then
    iface=$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')
    if [ -n "$iface" ]; then iw dev "$iface" scan; else echo "no wireless interface"; exit 1; fi
  elif command -v iwinfo >/dev/null 2>&1; then
    iwinfo scan
  else
    echo "iw and iwinfo are not installed"
    exit 1
  fi
) > /tmp/pinesshremo-survey.out 2>&1 &
echo $! > /tmp/pinesshremo-survey.pid
echo started
`.trim();

export const SURVEY_STOP_COMMAND = `
if [ -f /tmp/pinesshremo-survey.pid ]; then
  pid=$(cat /tmp/pinesshremo-survey.pid 2>/dev/null)
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  rm -f /tmp/pinesshremo-survey.pid
  echo stopped
else
  echo idle
fi
`.trim();

export function cronInitCommand(action: 'start' | 'stop'): string {
  return `/etc/init.d/cron ${action}`;
}

const SERVICE_NAMES = ['pineap', 'hostapd', 'dnsmasq', 'dropbear', 'uhttpd', 'crond', 'cron', 'odhcpd'];

export interface LiveClient {
  label: string;
  detail: string;
}

export interface LiveProcess {
  pid: string;
  name: string;
}

export interface LiveSnapshot {
  uptime: string;
  load: string;
  pineapKnown: boolean;
  pineapEnabled: boolean;
  broadcasting: boolean;
  ssidCount: number;
  ssids: string[];
  clients: LiveClient[];
  processes: LiveProcess[];
  cronLines: string[];
  cronService: 'enabled' | 'disabled' | 'missing' | 'unknown';
  surveyRunning: boolean;
  surveyTail: string;
  summary: string;
}

function section(output: string, name: string): string {
  const match = output.match(new RegExp(`===${name}===\\s*([\\s\\S]*?)(?=\\n===|$)`));
  return match ? match[1].trim() : '';
}

export function parseSsids(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const name = value.trim();
    if (!name || name.length > 32 || seen.has(name)) return;
    seen.add(name);
    found.push(name);
  };
  for (const line of text.split('\n')) {
    const quoted = line.match(/ssid\s*=\s*['"]([^'"]+)['"]/i) || line.match(/\bssid\s+['"]([^'"]+)['"]/i);
    if (quoted?.[1]) {
      add(quoted[1]);
      continue;
    }
    const plain = line.trim();
    if (!plain || plain.startsWith('===') || plain.startsWith('#')) continue;
    if (/not found|rejected|no ssid|error|usage|pineap|uci /i.test(plain)) continue;
    if (/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/.test(plain)) add(plain);
  }
  return found.slice(0, 40);
}

export function parseClients(leases: string, stations: string): LiveClient[] {
  const clients: LiveClient[] = [];
  for (const line of leases.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3 || parts[0] === 'NO_LEASES') continue;
    if (!/^[0-9a-f:]{11,17}$/i.test(parts[1] || '')) continue;
    clients.push({
      label: parts[3] && parts[3] !== '*' ? parts[3] : parts[2],
      detail: `${parts[2]} ${parts[1]}`,
    });
  }
  for (const line of stations.split('\n')) {
    const station = line.match(/^Station\s+([0-9a-f:]{11,17})/i);
    if (!station) continue;
    if (clients.some((client) => client.detail.includes(station[1]))) continue;
    clients.push({ label: station[1], detail: 'Associated station' });
  }
  return clients.slice(0, 40);
}

export function parseServiceProcesses(text: string): LiveProcess[] {
  const found: LiveProcess[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /^(PID|USER)/i.test(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    const name = SERVICE_NAMES.find((service) => new RegExp(`(^|\\s|/)${service}(\\s|$)`).test(lower));
    if (!name || seen.has(name)) continue;
    const pid = trimmed.split(/\s+/)[0] || '';
    if (!/^\d+$/.test(pid)) continue;
    seen.add(name);
    found.push({ pid, name });
  }
  return found;
}

export function parseCronLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line !== 'NO_CRONTAB')
    .slice(0, 20);
}

export function describeActivity(input: {
  pineapKnown: boolean;
  pineapEnabled: boolean;
  broadcasting: boolean;
  ssidCount: number;
  clientCount: number;
  surveyRunning: boolean;
  processNames: string[];
  armedJobs: number;
  schedulerRunning: boolean;
  cronService: LiveSnapshot['cronService'];
}): string {
  const parts: string[] = [];
  if (!input.pineapKnown) parts.push('PineAP status has not been read.');
  else if (input.pineapEnabled && input.broadcasting) parts.push(`PineAP is broadcasting ${input.ssidCount} SSID${input.ssidCount === 1 ? '' : 's'}.`);
  else if (input.pineapEnabled) parts.push('PineAP is on and the broadcast pool is off.');
  else parts.push('PineAP is stopped.');
  parts.push(`${input.clientCount} client${input.clientCount === 1 ? '' : 's'} on this Pineapple.`);
  if (input.surveyRunning) parts.push('A nearby-AP survey is running.');
  if (input.processNames.length) parts.push(`Services: ${input.processNames.join(', ')}.`);
  parts.push(
    input.schedulerRunning
      ? `${input.armedJobs} in-app job${input.armedJobs === 1 ? '' : 's'} armed.`
      : 'The in-app scheduler is paused.'
  );
  if (input.cronService === 'enabled') parts.push('Device cron is enabled.');
  else if (input.cronService === 'disabled') parts.push('Device cron is disabled.');
  return parts.join(' ');
}

export function parseLiveStatus(output: string): LiveSnapshot {
  const uptimeText = section(output, 'UPTIME');
  const loadMatch = uptimeText.match(/load average:\s*([0-9.]+)[, ]\s*([0-9.]+)[, ]\s*([0-9.]+)/i);
  const pineapText = section(output, 'PINEAP');
  const pineap = pineapText ? parsePineApStatus(`pineap\n${pineapText}`) : null;
  const ssids = parseSsids(section(output, 'SSIDS'));
  const ssidCount = Math.max(pineap?.activeSSIDs || 0, ssids.length);
  const clients = parseClients(section(output, 'CLIENTS'), section(output, 'STATIONS'));
  const processes = parseServiceProcesses(section(output, 'PROCS'));
  const cronLines = parseCronLines(section(output, 'CRON'));
  const cronRaw = section(output, 'CRONSVC').split('\n')[0]?.trim();
  const cronService: LiveSnapshot['cronService'] =
    cronRaw === 'enabled' || cronRaw === 'disabled' || cronRaw === 'missing' ? cronRaw : 'unknown';
  const surveyText = section(output, 'SURVEY');
  const surveyRunning = /^RUNNING\b/m.test(surveyText);
  const surveyTail = surveyText.replace(/^RUNNING\s*|^IDLE\s*/m, '').trim();
  const pineapKnown = Boolean(pineap?.known);
  const pineapEnabled = Boolean(pineap?.enabled);
  const broadcasting = Boolean(pineap?.enabled && (pineap.apPool || ssidCount > 0));
  const base: LiveSnapshot = {
    uptime: uptimeText.replace(/\s+/g, ' ').slice(0, 140) || 'Unread',
    load: loadMatch ? `${loadMatch[1]}, ${loadMatch[2]}, ${loadMatch[3]}` : 'Unread',
    pineapKnown,
    pineapEnabled,
    broadcasting,
    ssidCount,
    ssids,
    clients,
    processes,
    cronLines,
    cronService,
    surveyRunning,
    surveyTail,
    summary: '',
  };
  base.summary = describeActivity({
    pineapKnown,
    pineapEnabled,
    broadcasting,
    ssidCount,
    clientCount: clients.length,
    surveyRunning,
    processNames: processes.map((item) => item.name),
    armedJobs: 0,
    schedulerRunning: true,
    cronService,
  });
  return base;
}
