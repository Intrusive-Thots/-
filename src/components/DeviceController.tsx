import React, { useMemo, useState } from 'react';
import { Boxes, Package, Power, RefreshCw, Settings2 } from 'lucide-react';
import type { SSHConfig } from '../types';
import { sshExec } from '../utils/deviceSsh';
import {
  DEVICE_SNAPSHOT_COMMAND,
  REBOOT_COMMAND,
  buildApplyCommand,
  moduleDepsScriptCommand,
  opkgInfoCommand,
  opkgInstallCommand,
  opkgRemoveCommand,
  parseDeviceSnapshot,
  removeModuleCommand,
  serviceCommand,
  type DeviceSnapshot,
  type UciChange,
  type UciSection,
} from '../utils/deviceControl';

interface DeviceControllerProps {
  config: SSHConfig;
  onHostFingerprint?: (fingerprint: string) => void;
}

interface PendingAction {
  title: string;
  detail: string;
  command: string;
  timeoutMs: number;
}

const FIELD_LABELS: Record<string, string> = {
  hostname: 'Hostname',
  zonename: 'Timezone name',
  timezone: 'POSIX timezone',
  ssid: 'SSID',
  key: 'Wi-Fi key',
  encryption: 'Encryption',
  disabled: 'Disabled (1 or 0)',
  channel: 'Channel',
  country: 'Country',
  htmode: 'HT mode',
  mode: 'Mode',
  ipaddr: 'LAN address',
  netmask: 'LAN netmask',
  proto: 'LAN protocol',
  start: 'DHCP start',
  limit: 'DHCP limit',
  leasetime: 'DHCP lease',
};

function fieldKey(pkg: string, section: string, option: string): string {
  return `${pkg}|${section}|${option}`;
}

function sectionsOf(list: UciSection[], type: string): UciSection[] {
  return list.filter((section) => section.type === type);
}

export const DeviceController: React.FC<DeviceControllerProps> = ({ config, onHostFingerprint }) => {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [packageQuery, setPackageQuery] = useState('');
  const [packageName, setPackageName] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);

  const run = async (command: string, timeoutMs: number) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await sshExec({ ...config, timeoutMs }, command);
      if (data.hostFingerprint) onHostFingerprint?.(data.hostFingerprint);
      const text = [data.stdout, data.stderr, data.error].filter(Boolean).join('\n');
      setOutput(text);
      if (!data.success || data.exitCode !== 0) {
        setError(data.error || data.stderr || `Command exited ${data.exitCode ?? 1}`);
        return false;
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SSH request failed';
      setError(message);
      setOutput(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await sshExec({ ...config, timeoutMs: 20000 }, DEVICE_SNAPSHOT_COMMAND);
      if (data.hostFingerprint) onHostFingerprint?.(data.hostFingerprint);
      const text = [data.stdout, data.stderr].filter(Boolean).join('\n');
      setOutput(text);
      if (!data.success || data.exitCode !== 0 || !data.stdout) {
        setSnapshot(null);
        setError(data.error || data.stderr || 'Could not read the device.');
        return;
      }
      setSnapshot(parseDeviceSnapshot(data.stdout));
      setDrafts({});
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : 'SSH request failed');
    } finally {
      setBusy(false);
    }
  };

  const packages = useMemo(() => {
    const query = packageQuery.trim().toLowerCase();
    const list = snapshot?.packages || [];
    const filtered = query ? list.filter((pkg) => pkg.name.toLowerCase().includes(query)) : list;
    return filtered.slice(0, 80);
  }, [packageQuery, snapshot]);

  const setDraft = (pkg: string, section: UciSection, option: string, value: string) => {
    const current = section.options[option] || '';
    const key = fieldKey(pkg, section.section, option);
    setDrafts((prev) => {
      const next = { ...prev };
      if (value === current) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const draftValue = (pkg: string, section: UciSection, option: string) => {
    const key = fieldKey(pkg, section.section, option);
    return key in drafts ? drafts[key] : section.options[option] || '';
  };

  const saveSettings = () => {
    if (!snapshot) return;
    const changes: UciChange[] = [];
    const groups: { pkg: UciChange['pkg']; sections: UciSection[] }[] = [
      { pkg: 'system', sections: snapshot.system },
      { pkg: 'wireless', sections: snapshot.wireless },
      { pkg: 'network', sections: snapshot.network },
      { pkg: 'dhcp', sections: snapshot.dhcp },
    ];
    for (const group of groups) {
      for (const section of group.sections) {
        for (const option of Object.keys(FIELD_LABELS)) {
          const key = fieldKey(group.pkg, section.section, option);
          if (!(key in drafts)) continue;
          if (section.options[option] === undefined && drafts[key] === '') continue;
          changes.push({ pkg: group.pkg, section: section.section, option, value: drafts[key] });
        }
      }
    }
    const command = buildApplyCommand(changes);
    if (!command) {
      setError('Nothing to save, or a value is not in the allowed form.');
      return;
    }
    setPending({
      title: 'Write settings on the Pineapple',
      detail: 'Wireless and LAN changes can drop this SSH session until you rejoin.',
      command,
      timeoutMs: 30000,
    });
  };

  const confirmPending = async () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    const ok = await run(action.command, action.timeoutMs);
    if (ok && action.command !== REBOOT_COMMAND) await load();
  };

  const renderFields = (pkg: UciChange['pkg'], section: UciSection, options: string[]) => (
    <div key={`${pkg}-${section.section}`} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-sm font-mono text-amber-300">
        {section.type || pkg} · {section.section}
      </div>
      {options.map((option) => (
        <label key={option} className="block space-y-1">
          <span className="text-xs text-slate-400">{FIELD_LABELS[option]}</span>
          <input
            value={draftValue(pkg, section, option)}
            onChange={(event) => setDraft(pkg, section, option, event.target.value)}
            className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-base text-slate-100"
          />
        </label>
      ))}
    </div>
  );

  const systemSection = snapshot?.system.find((section) => section.type === 'system');
  const lan =
    snapshot?.network.find((section) => section.section === 'lan') ||
    snapshot?.network.find((section) => section.type === 'interface');
  const dhcpLan =
    snapshot?.dhcp.find((section) => section.section === 'lan') ||
    snapshot?.dhcp.find((section) => section.type === 'dhcp');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 space-y-3">
        <div className="flex items-start gap-3">
          <Settings2 className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-slate-100">Device control</h2>
            <p className="text-sm text-slate-400">
              Reads and writes this Pineapple over SSH with uci, opkg, and the module folders already on the device.
              PineAP start and stop stay on the Dashboard.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 font-bold text-slate-950 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Working…' : 'Read this Pineapple'}
        </button>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>

      {!snapshot && (
        <p className="text-sm text-slate-400">
          Nothing is loaded yet. Join the Pineapple network, save the SSH login in Config, then read the device.
        </p>
      )}

      {snapshot && (
        <>
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <h3 className="font-bold">System</h3>
            <pre className="whitespace-pre-wrap text-xs text-slate-300 font-mono">{snapshot.release || 'No release file'}</pre>
            <pre className="whitespace-pre-wrap text-xs text-slate-300 font-mono">{snapshot.uptime}</pre>
            <pre className="whitespace-pre-wrap text-xs text-slate-300 font-mono">{snapshot.memory}</pre>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-300 font-mono">{snapshot.storage}</pre>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setPending({
                  title: 'Reboot the Pineapple',
                  detail: 'SSH will drop until the device finishes booting.',
                  command: REBOOT_COMMAND,
                  timeoutMs: 10000,
                })
              }
              className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-rose-800 px-4 text-rose-300"
            >
              <Power className="w-4 h-4" />
              Reboot
            </button>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h3 className="font-bold">Settings</h3>
            <p className="text-sm text-slate-400">
              Hostname, time, the management radio, LAN address, and DHCP. Values are checked before they are sent.
            </p>
            {snapshot.uciMissing.length > 0 && (
              <p className="text-sm text-amber-300">uci did not return: {snapshot.uciMissing.join(', ')}</p>
            )}
            {systemSection && renderFields('system', systemSection, ['hostname', 'zonename', 'timezone'])}
            {sectionsOf(snapshot.wireless, 'wifi-device').map((section) =>
              renderFields('wireless', section, ['channel', 'country', 'htmode', 'disabled'])
            )}
            {sectionsOf(snapshot.wireless, 'wifi-iface').map((section) =>
              renderFields('wireless', section, ['ssid', 'key', 'encryption', 'mode', 'disabled'])
            )}
            {lan && renderFields('network', lan, ['proto', 'ipaddr', 'netmask'])}
            {dhcpLan && renderFields('dhcp', dhcpLan, ['start', 'limit', 'leasetime'])}
            <button
              type="button"
              disabled={busy || Object.keys(drafts).length === 0}
              onClick={saveSettings}
              className="min-h-11 w-full rounded-xl bg-amber-500 font-bold text-slate-950 disabled:opacity-40"
            >
              Save changed settings
            </button>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h3 className="font-bold">Services</h3>
            <div className="space-y-2">
              {snapshot.services.map((service) => (
                <div key={service.name} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-slate-800 p-3">
                  <div className="flex-1">
                    <div className="font-mono text-sm">{service.name}</div>
                    <div className="text-xs text-slate-400">{service.state}</div>
                  </div>
                  {service.state !== 'absent' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const command = serviceCommand(service.name, service.state === 'enabled' ? 'disable' : 'enable');
                          if (!command) return;
                          setPending({
                            title: `${service.state === 'enabled' ? 'Disable' : 'Enable'} ${service.name}`,
                            detail: 'This calls the OpenWrt init script on the device.',
                            command,
                            timeoutMs: 20000,
                          });
                        }}
                        className="min-h-11 flex-1 rounded-xl border border-slate-700 px-3 text-sm"
                      >
                        {service.state === 'enabled' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const command = serviceCommand(service.name, 'restart');
                          if (!command) return;
                          setPending({
                            title: `Restart ${service.name}`,
                            detail: 'Restarting network or dropbear can drop SSH.',
                            command,
                            timeoutMs: 20000,
                          });
                        }}
                        className="min-h-11 flex-1 rounded-xl border border-slate-700 px-3 text-sm"
                      >
                        Restart
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold">Packages (opkg)</h3>
            </div>
            {snapshot.opkgMissing ? (
              <p className="text-sm text-rose-300">opkg is not on this device.</p>
            ) : (
              <>
                <p className="text-sm text-slate-400">{snapshot.packages.length} installed packages. Install uses the name you type.</p>
                <input
                  value={packageQuery}
                  onChange={(event) => setPackageQuery(event.target.value)}
                  placeholder="Filter installed packages"
                  className="w-full min-h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-base"
                />
                <div className="max-h-64 space-y-2 overflow-auto">
                  {packages.map((pkg) => (
                    <div key={pkg.name} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm">{pkg.name}</div>
                        <div className="text-xs text-slate-500">{pkg.version}</div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const command = opkgRemoveCommand(pkg.name);
                          if (!command) return;
                          setPending({
                            title: `Remove ${pkg.name}`,
                            detail: 'opkg remove runs on the device. Shared libraries used by other packages can break.',
                            command,
                            timeoutMs: 60000,
                          });
                        }}
                        className="min-h-11 shrink-0 rounded-xl border border-rose-900 px-3 text-sm text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={packageName}
                    onChange={(event) => setPackageName(event.target.value)}
                    placeholder="Package name"
                    className="min-h-11 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 text-base"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const command = opkgInfoCommand(packageName);
                      if (!command) {
                        setError('Package names are letters, numbers, dot, plus, underscore, and hyphen.');
                        return;
                      }
                      void run(command, 20000);
                    }}
                    className="min-h-11 rounded-xl border border-slate-700 px-4"
                  >
                    Info
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const command = opkgInstallCommand([packageName]);
                      if (!command) {
                        setError('Package names are letters, numbers, dot, plus, underscore, and hyphen.');
                        return;
                      }
                      setPending({
                        title: `Install ${packageName.trim()}`,
                        detail: 'Runs opkg update, then opkg install. The Pineapple needs a route to its package feeds.',
                        command,
                        timeoutMs: 120000,
                      });
                    }}
                    className="min-h-11 rounded-xl bg-amber-500 px-4 font-bold text-slate-950"
                  >
                    Install
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold">Modules on disk</h3>
            </div>
            <p className="text-sm text-slate-400">
              Lists /pineapple/modules and the SD module folders. Dependency install uses opkg or the module’s dependencies.sh when that file exists.
              Downloading the Hak5 catalog still needs the Pineapple web session.
            </p>
            {snapshot.moduleRootsMissing.length > 0 && (
              <p className="text-xs text-slate-500">Missing: {snapshot.moduleRootsMissing.join(', ')}</p>
            )}
            {snapshot.modules.length === 0 && <p className="text-sm text-slate-400">No module directories were found.</p>}
            {snapshot.modules.map((module) => (
              <div key={`${module.root}/${module.name}`} className="space-y-2 rounded-xl border border-slate-800 p-3">
                <div>
                  <div className="font-bold">{module.title}</div>
                  <div className="font-mono text-xs text-slate-400">
                    {module.root}/{module.name}
                    {module.version ? ` · ${module.version}` : ''}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {module.dependencies.length > 0
                    ? `Dependencies: ${module.dependencies.join(', ')}`
                    : 'No opkg dependency list in module.info.'}
                  {module.hasDepsScript ? ' dependencies.sh is present.' : ''}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {module.dependencies.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const command = opkgInstallCommand(module.dependencies);
                        if (!command) return;
                        setPending({
                          title: `Install dependencies for ${module.name}`,
                          detail: command,
                          command,
                          timeoutMs: 120000,
                        });
                      }}
                      className="min-h-11 rounded-xl border border-slate-700 px-3 text-sm"
                    >
                      Install dependencies
                    </button>
                  )}
                  {module.hasDepsScript && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const command = moduleDepsScriptCommand(module.root, module.name);
                        if (!command) return;
                        setPending({
                          title: `Run dependencies.sh for ${module.name}`,
                          detail: 'This is the module install script stored on the device.',
                          command,
                          timeoutMs: 120000,
                        });
                      }}
                      className="min-h-11 rounded-xl border border-slate-700 px-3 text-sm"
                    >
                      Run dependencies.sh
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const command = removeModuleCommand(module.root, module.name);
                      if (!command) return;
                      setPending({
                        title: `Remove ${module.name}`,
                        detail: 'Deletes that module directory. It does not uninstall every shared opkg package.',
                        command,
                        timeoutMs: 20000,
                      });
                    }}
                    className="min-h-11 rounded-xl border border-rose-900 px-3 text-sm text-rose-300"
                  >
                    Remove folder
                  </button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {output && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-300">Last SSH output</h3>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-emerald-300/90 font-mono">{output}</pre>
        </section>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <h3 className="text-lg font-bold">{pending.title}</h3>
            <p className="text-sm text-slate-300">{pending.detail}</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-amber-200 font-mono">
              {pending.command}
            </pre>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="min-h-11 flex-1 rounded-xl border border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPending}
                className="min-h-11 flex-1 rounded-xl bg-amber-500 font-bold text-slate-950"
              >
                Run on device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
