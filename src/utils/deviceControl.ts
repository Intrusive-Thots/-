/** SSH commands for the owner's Pineapple: opkg, UCI, init scripts, and module directories. */

export const MODULE_ROOTS = ['/pineapple/modules', '/sd/modules', '/sd/pineapple/modules'] as const;

export const SERVICE_NAMES = [
  'firewall',
  'dnsmasq',
  'dropbear',
  'cron',
  'network',
  'system',
  'uhttpd',
  'pineapple',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export const DEVICE_SNAPSHOT_COMMAND = `
echo "===RELEASE==="
cat /etc/openwrt_release 2>/dev/null || true
uname -a
echo "===UPTIME==="
uptime
echo "===FREE==="
free -m 2>/dev/null || free
echo "===DF==="
df -h 2>/dev/null || df
echo "===UCI_SYSTEM==="
uci show system 2>/dev/null || echo UCI_MISSING
echo "===UCI_WIRELESS==="
uci show wireless 2>/dev/null || echo UCI_MISSING
echo "===UCI_NETWORK==="
uci show network 2>/dev/null || echo UCI_MISSING
echo "===UCI_DHCP==="
uci show dhcp 2>/dev/null || echo UCI_MISSING
echo "===OPKG==="
if command -v opkg >/dev/null 2>&1; then opkg list-installed; else echo OPKG_MISSING; fi
echo "===SERVICES==="
for s in firewall dnsmasq dropbear cron network system uhttpd pineapple; do
  if [ -x "/etc/init.d/$s" ]; then
    if "/etc/init.d/$s" enabled >/dev/null 2>&1; then echo "$s enabled"; else echo "$s disabled"; fi
  else
    echo "$s absent"
  fi
done
echo "===MODULES==="
for root in /pineapple/modules /sd/modules /sd/pineapple/modules; do
  if [ -d "$root" ]; then
    echo "ROOT $root"
    for d in "$root"/*; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
      echo "MODULE $name"
      if [ -f "$d/module.info" ]; then head -n 80 "$d/module.info"; else echo NOINFO; fi
      if [ -f "$d/scripts/dependencies.sh" ]; then echo HAS_DEPS_SCRIPT; fi
      echo "===ENDMODULE==="
    done
  else
    echo "NOROOT $root"
  fi
done
`.trim();

export function safePackageName(name: string): string | null {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

export function safeModuleName(name: string): string | null {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

export function safeSection(section: string): string | null {
  if (/^@[A-Za-z0-9_-]+\[\d+\]$/.test(section)) return section;
  if (/^[A-Za-z0-9_]+$/.test(section)) return section;
  return null;
}

const OPTION_RULES: Record<string, RegExp> = {
  hostname: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/,
  zonename: /^[A-Za-z0-9_+/-]{1,64}$/,
  timezone: /^[A-Za-z0-9_+:/<>-]{1,48}$/,
  ssid: /^[\x20-\x7E]{1,32}$/,
  key: /^[\x20-\x7E]{8,63}$/,
  encryption: /^(none|psk|psk2|sae|sae-mixed|psk-mixed)$/,
  disabled: /^[01]$/,
  channel: /^(auto|[0-9]{1,3})$/,
  country: /^([A-Z]{2}|00)$/,
  htmode: /^(HT20|HT40|VHT20|VHT40|VHT80|HE20|HE40|HE80)$/,
  mode: /^(ap|sta)$/,
  ipaddr: /^(?:\d{1,3}\.){3}\d{1,3}$/,
  netmask: /^(?:\d{1,3}\.){3}\d{1,3}$/,
  proto: /^(static|dhcp|none)$/,
  start: /^\d{1,5}$/,
  limit: /^\d{1,5}$/,
  leasetime: /^\d{1,5}[mhd]$/,
};

const PACKAGE_OPTIONS: Record<string, string[]> = {
  system: ['hostname', 'zonename', 'timezone'],
  wireless: ['ssid', 'key', 'encryption', 'disabled', 'channel', 'country', 'htmode', 'mode'],
  network: ['ipaddr', 'netmask', 'proto'],
  dhcp: ['start', 'limit', 'leasetime'],
};

export interface UciChange {
  pkg: 'system' | 'wireless' | 'network' | 'dhcp';
  section: string;
  option: string;
  value: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function ipv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function validateSetting(option: string, value: string): string | null {
  const rule = OPTION_RULES[option];
  if (!rule) return null;
  if (option === 'ssid' || option === 'key') {
    if (/['"`$\\;&|<>]/.test(value)) return null;
  }
  if (!rule.test(value)) return null;
  if ((option === 'ipaddr' || option === 'netmask') && !ipv4(value)) return null;
  return value;
}

export function buildApplyCommand(changes: UciChange[]): string | null {
  if (changes.length === 0) return null;
  const packages = new Set<string>();
  const sets: string[] = [];
  for (const change of changes) {
    const allowed = PACKAGE_OPTIONS[change.pkg];
    if (!allowed || !allowed.includes(change.option)) return null;
    const section = safeSection(change.section);
    const value = validateSetting(change.option, change.value);
    if (!section || value === null) return null;
    packages.add(change.pkg);
    sets.push(`uci set ${change.pkg}.${section}.${change.option}=${shellQuote(value)}`);
  }
  const commits = [...packages].map((pkg) => `uci commit ${pkg}`);
  const reloads: string[] = [];
  if (packages.has('system')) reloads.push('/etc/init.d/system reload');
  if (packages.has('dhcp')) reloads.push('/etc/init.d/dnsmasq restart');
  if (packages.has('network')) reloads.push('/etc/init.d/network reload');
  if (packages.has('wireless')) reloads.push('wifi reload');
  return [...sets, ...commits, ...reloads].join(' && ');
}

export function opkgInstallCommand(names: string[]): string | null {
  if (names.length === 0 || names.length > 12) return null;
  const safe = names.map((name) => safePackageName(name));
  if (safe.some((name) => !name)) return null;
  return `opkg update && opkg install ${safe.join(' ')}`;
}

export function opkgRemoveCommand(name: string): string | null {
  const safe = safePackageName(name);
  if (!safe) return null;
  return `opkg remove ${safe}`;
}

export function opkgInfoCommand(name: string): string | null {
  const safe = safePackageName(name);
  if (!safe) return null;
  return `opkg info ${safe}`;
}

export function serviceCommand(name: string, action: 'enable' | 'disable' | 'restart'): string | null {
  if (!SERVICE_NAMES.includes(name as ServiceName)) return null;
  return `/etc/init.d/${name} ${action}`;
}

export function removeModuleCommand(root: string, name: string): string | null {
  if (!MODULE_ROOTS.includes(root as (typeof MODULE_ROOTS)[number])) return null;
  const safe = safeModuleName(name);
  if (!safe) return null;
  const path = shellQuote(`${root}/${safe}`);
  return `if [ -d ${path} ]; then rm -rf -- ${path} && echo removed ${safe}; else echo missing ${safe}; exit 1; fi`;
}

export function moduleDepsScriptCommand(root: string, name: string): string | null {
  if (!MODULE_ROOTS.includes(root as (typeof MODULE_ROOTS)[number])) return null;
  const safe = safeModuleName(name);
  if (!safe) return null;
  const path = shellQuote(`${root}/${safe}/scripts/dependencies.sh`);
  return `if [ -f ${path} ]; then sh ${path} install; else echo "dependencies.sh not found"; exit 1; fi`;
}

export const REBOOT_COMMAND = 'reboot';

export interface UciOption {
  section: string;
  option: string;
  value: string;
}

export interface UciSection {
  section: string;
  type: string;
  options: Record<string, string>;
}

export interface InstalledPackage {
  name: string;
  version: string;
}

export interface DeviceModule {
  root: string;
  name: string;
  info: string;
  title: string;
  version: string;
  dependencies: string[];
  hasDepsScript: boolean;
}

export interface DeviceSnapshot {
  release: string;
  uptime: string;
  memory: string;
  storage: string;
  uciMissing: string[];
  system: UciSection[];
  wireless: UciSection[];
  network: UciSection[];
  dhcp: UciSection[];
  packages: InstalledPackage[];
  opkgMissing: boolean;
  services: { name: string; state: 'enabled' | 'disabled' | 'absent' }[];
  modules: DeviceModule[];
  moduleRootsMissing: string[];
}

function sectionOf(text: string, name: string): string {
  const match = text.match(new RegExp(`===${name}===\\s*([\\s\\S]*?)(?=\\n===|$)`));
  return match ? match[1].trim() : '';
}

function unquoteUci(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/'\\''/g, "'");
  }
  return trimmed;
}

export function parseUciShow(text: string): UciSection[] {
  const sections = new Map<string, UciSection>();
  for (const line of text.split('\n')) {
    const match = line.match(
      /^([a-zA-Z0-9_]+)\.((?:@[A-Za-z0-9_-]+\[\d+\])|[A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?=(.*)$/
    );
    if (!match) continue;
    const section = match[2];
    const option = match[3];
    const value = unquoteUci(match[4]);
    const current = sections.get(section) || { section, type: '', options: {} };
    if (!option) current.type = value;
    else current.options[option] = value;
    sections.set(section, current);
  }
  return [...sections.values()];
}

function parsePackages(text: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9.+_-]*) - (\S+)/);
    if (match) packages.push({ name: match[1], version: match[2] });
  }
  return packages;
}

function parseDependencies(info: string): { title: string; version: string; dependencies: string[] } {
  const title = info.match(/"title"\s*:\s*"([^"]+)"/)?.[1] || '';
  const version = info.match(/"version"\s*:\s*"([^"]+)"/)?.[1] || '';
  const array = info.match(/"(?:dependencies|depends)"\s*:\s*\[([^\]]*)\]/);
  const single = info.match(/"(?:dependencies|depends)"\s*:\s*"([^"]+)"/);
  let dependencies: string[] = [];
  if (array) {
    dependencies = [...array[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  } else if (single) {
    dependencies = single[1].split(/[,\s]+/).filter(Boolean);
  }
  return {
    title,
    version,
    dependencies: dependencies.filter((name) => safePackageName(name)),
  };
}

function parseModules(text: string): { modules: DeviceModule[]; missing: string[] } {
  const modules: DeviceModule[] = [];
  const missing: string[] = [];
  let root = '';
  const blocks = text.split('\n');
  let index = 0;
  while (index < blocks.length) {
    const line = blocks[index];
    if (line.startsWith('NOROOT ')) {
      missing.push(line.slice(7).trim());
      index += 1;
      continue;
    }
    if (line.startsWith('ROOT ')) {
      root = line.slice(5).trim();
      index += 1;
      continue;
    }
    if (line.startsWith('MODULE ') && root) {
      const name = line.slice(7).trim();
      index += 1;
      const body: string[] = [];
      while (index < blocks.length && blocks[index] !== '===ENDMODULE===') {
        body.push(blocks[index]);
        index += 1;
      }
      const info = body.filter((entry) => entry !== 'HAS_DEPS_SCRIPT' && entry !== 'NOINFO').join('\n');
      const parsed = parseDependencies(info);
      modules.push({
        root,
        name,
        info,
        title: parsed.title || name,
        version: parsed.version,
        dependencies: parsed.dependencies,
        hasDepsScript: body.includes('HAS_DEPS_SCRIPT'),
      });
    }
    index += 1;
  }
  return { modules, missing };
}

export function parseDeviceSnapshot(output: string): DeviceSnapshot {
  const opkg = sectionOf(output, 'OPKG');
  const services = sectionOf(output, 'SERVICES')
    .split('\n')
    .map((line) => {
      const match = line.match(/^(firewall|dnsmasq|dropbear|cron|network|system|uhttpd|pineapple) (enabled|disabled|absent)$/);
      if (!match) return null;
      return { name: match[1], state: match[2] as 'enabled' | 'disabled' | 'absent' };
    })
    .filter((item): item is { name: string; state: 'enabled' | 'disabled' | 'absent' } => Boolean(item));
  const uciMissing: string[] = [];
  const takeUci = (label: string) => {
    const text = sectionOf(output, label);
    if (!text || text === 'UCI_MISSING') {
      uciMissing.push(label);
      return [];
    }
    return parseUciShow(text);
  };
  const modules = parseModules(sectionOf(output, 'MODULES'));
  return {
    release: sectionOf(output, 'RELEASE'),
    uptime: sectionOf(output, 'UPTIME'),
    memory: sectionOf(output, 'FREE'),
    storage: sectionOf(output, 'DF'),
    uciMissing,
    system: takeUci('UCI_SYSTEM'),
    wireless: takeUci('UCI_WIRELESS'),
    network: takeUci('UCI_NETWORK'),
    dhcp: takeUci('UCI_DHCP'),
    packages: opkg === 'OPKG_MISSING' ? [] : parsePackages(opkg),
    opkgMissing: opkg === 'OPKG_MISSING',
    services,
    modules: modules.modules,
    moduleRootsMissing: modules.missing,
  };
}
