import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INITIAL_PAYLOAD_TEMPLATES } from '../src/data/payloadTemplates.ts';
import { DEFAULT_SCHEDULER_PRESETS } from '../src/data/schedulerPresets.ts';
import { encodePrintfOctal, printfWriteCommands, wrapScriptCommand } from '../src/utils/sshCommands.ts';
import { generateHardwareDeployCommand } from '../src/utils/schedulerUtils.ts';
import {
  buildApplyCommand,
  opkgInstallCommand,
  parseDeviceSnapshot,
  removeModuleCommand,
  safePackageName,
} from '../src/utils/deviceControl.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function decodeOctal(octal: string): string {
  const bytes: number[] = [];
  const pattern = /\\([0-7]{3})/g;
  let match: RegExpExecArray | null;
  let last = 0;
  while ((match = pattern.exec(octal))) {
    if (match.index !== last) fail(`octal encoding has raw text at ${match.index}`);
    bytes.push(parseInt(match[1], 8));
    last = match.index + match[0].length;
  }
  if (last !== octal.length) fail('octal encoding did not consume the whole string');
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

const sample = "quote ' \" $ ` \\\nline\t$(reboot)\n";
const encoded = encodePrintfOctal(new TextEncoder().encode(sample));
if (decodeOctal(encoded) !== sample) fail('octal round-trip mismatch');
if (/\bbase64\b/.test(encoded)) fail('octal payload contained the word base64');

const wrapped = wrapScriptCommand(sample, 'probe.sh');
if (/\bbase64\b/.test(wrapped)) fail('wrapScriptCommand still calls base64');
if (!wrapped.includes("printf '%b'")) fail('wrapScriptCommand does not use printf %b');
if (!wrapped.includes('sh /tmp/payloads/probe.sh')) fail('shell payloads are not invoked with sh');

const deploy = generateHardwareDeployCommand({
  id: 'job_test_1',
  name: 'Health',
  description: 'check',
  code: sample,
  language: 'bash',
  triggerType: 'interval',
  intervalMinutes: 15,
  cronExpression: '*/15 * * * *',
  targetEngine: 'openwrt-cron',
  enabled: false,
  createdAt: new Date().toISOString(),
  runCount: 0,
  history: [],
});
if (!deploy || /\bbase64\b/.test(deploy)) fail('hardware deploy still calls base64');
if (!deploy.includes("printf '%b'")) fail('hardware deploy does not use printf %b');

if (INITIAL_PAYLOAD_TEMPLATES.length !== 20) {
  fail(`expected 20 payloads, found ${INITIAL_PAYLOAD_TEMPLATES.length}`);
}

const forbidden = /\b(base64|airmon-ng|macchanger|hexdump|python3|bash|grep\s+-[A-Za-z]*[APo])\b/;
function executableText(script: string): string {
  return script
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

for (const template of INITIAL_PAYLOAD_TEMPLATES) {
  if (!template.code.startsWith('#!/bin/sh')) fail(`${template.id} is not a /bin/sh script`);
  if (forbidden.test(executableText(template.code))) {
    fail(`${template.id} uses a tool BusyBox ash on Pineapple does not provide`);
  }
}
for (const preset of DEFAULT_SCHEDULER_PRESETS) {
  if (forbidden.test(executableText(preset.code))) fail(`preset ${preset.name} uses a missing tool`);
  if (!preset.code.includes('${IFACE:-none}') && preset.name.includes('Recon')) {
    // The recon preset must keep the shell default, not a JS interpolation hole.
  }
}
const recon = DEFAULT_SCHEDULER_PRESETS[0].code;
if (!recon.includes('${IFACE:-none}')) fail('recon preset lost the shell default for IFACE');

const root = mkdtempSync(join(tmpdir(), 'pine-payloads-'));
const bin = join(root, 'bin');
mkdirSync(bin);
const stub = (name: string, body: string) => {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};
stub('pineap', 'echo "pineap $*"; echo "get_status: stopped"; exit 0');
stub('iw', 'if [ "$1" = "dev" ] && [ "$2" = "" ]; then echo "Interface wlan0"; else echo "iw $*"; fi');
stub('iwinfo', 'echo "wlan0 ESSID: lab signal: -40 dBm"');
stub('uci', 'echo "wireless.radio0=wifi-device"');
stub('logread', 'echo "daemon.info pineap: status"');
stub('dmesg', 'echo "ath9k: firmware loaded"');
stub('crontab', 'echo "# empty"');
stub('ifconfig', 'echo "wlan0 Link encap:Ethernet HWaddr 00:11:22:33:44:55"');
stub('route', 'echo "Kernel IP routing table"');
stub('ip', 'echo "default via 172.16.42.1"');

const busybox = (() => {
  try {
    return execFileSync('sh', ['-c', 'command -v busybox'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
const shell = busybox ? [busybox, 'ash'] : ['sh'];

function runScript(code: string, label: string) {
  const file = join(root, `${label}.sh`);
  writeFileSync(file, code);
  try {
    const stdout = execFileSync(shell[0], shell.slice(1).concat(file), {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/bin:/usr/bin` },
      timeout: 15000,
    });
    if (!stdout.trim()) fail(`${label} produced no output`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`${label} failed under ${shell.join(' ')}: ${detail}`);
  }
}

INITIAL_PAYLOAD_TEMPLATES.forEach((template, index) => runScript(template.code, `${index}-${template.id}`));
DEFAULT_SCHEDULER_PRESETS.forEach((preset, index) => runScript(preset.code, `preset-${index}`));

const remote = wrapScriptCommand('echo busybox-ok\n', 'roundtrip.sh');
const transport = execFileSync(shell[0], shell.slice(1).concat(['-c', remote]), {
  encoding: 'utf8',
  env: { ...process.env, PATH: `${bin}:/bin:/usr/bin` },
  timeout: 15000,
});
if (!transport.includes('busybox-ok')) fail(`printf transport did not run the script: ${transport}`);
const written = readFileSync('/tmp/payloads/roundtrip.sh', 'utf8');
if (written !== 'echo busybox-ok\n') fail(`remote script bytes mismatch: ${JSON.stringify(written)}`);

const writes = printfWriteCommands('/tmp/payloads/chunk.sh', 'a'.repeat(4000));
if (writes.filter((line) => line.startsWith('printf')).length < 2) fail('long scripts were not chunked');

if (safePackageName('pkg;reboot') !== null) fail('package names accept shell metacharacters');
if (opkgInstallCommand(['tcpdump']) !== 'opkg update && opkg install tcpdump') fail('opkg install command mismatch');
if (removeModuleCommand('/pineapple/modules', '../etc') !== null) fail('module removal accepts a path escape');
const apply = buildApplyCommand([
  { pkg: 'system', section: '@system[0]', option: 'hostname', value: 'Pineapple' },
]);
if (!apply || !apply.includes("uci set system.@system[0].hostname='Pineapple'")) fail('uci apply command mismatch');
if (buildApplyCommand([{ pkg: 'system', section: '@system[0]', option: 'hostname', value: "a';reboot" }]) !== null) {
  fail('uci values accept quotes');
}
const parsed = parseDeviceSnapshot(`
===RELEASE===
DISTRIB_DESCRIPTION='WiFi Pineapple Mark VII'
===UPTIME===
up 1 minute
===FREE===
Mem: 100 40 60
===DF===
/dev/sda1 100 10 90 10% /sd
===UCI_SYSTEM===
system.@system[0]=system
system.@system[0].hostname='Pineapple'
===UCI_WIRELESS===
wireless.radio0=wifi-device
wireless.radio0.channel='6'
wireless.@wifi-iface[0]=wifi-iface
wireless.@wifi-iface[0].ssid='Lab'
===UCI_NETWORK===
network.lan=interface
network.lan.ipaddr='172.16.42.1'
===UCI_DHCP===
dhcp.lan=dhcp
dhcp.lan.start='100'
===OPKG===
tcpdump - 4.99.1-1
===SERVICES===
cron enabled
dropbear disabled
pineapple absent
===MODULES===
NOROOT /sd/modules
ROOT /pineapple/modules
MODULE Cabinet
{"title":"Cabinet","version":"1.2","dependencies":["python3","bad;rm"]}
HAS_DEPS_SCRIPT
===ENDMODULE===
`);
if (parsed.packages[0]?.name !== 'tcpdump') fail('opkg list was not parsed');
if (parsed.system[0]?.options.hostname !== 'Pineapple') fail('uci hostname was not parsed');
if (parsed.wireless.find((section) => section.type === 'wifi-iface')?.options.ssid !== 'Lab') {
  fail('wifi iface was not parsed');
}
if (parsed.modules.length !== 1 || parsed.modules[0].dependencies.join(',') !== 'python3') {
  fail(`module dependencies were not filtered: ${parsed.modules[0]?.dependencies.join(',')}`);
}
if (!parsed.modules[0].hasDepsScript) fail('dependencies.sh was not detected');
if (parsed.services.find((service) => service.name === 'cron')?.state !== 'enabled') fail('service state was not parsed');

console.log(`verified ${INITIAL_PAYLOAD_TEMPLATES.length} payloads with ${shell.join(' ')}`);
