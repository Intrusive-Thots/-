const STORAGE_KEY = 'wifi_pineapple_host_pins';

export function hostPinId(host: string, port: number): string {
  return `${host.trim().toLowerCase()}:${port}`;
}

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function readHostPin(host: string, port: number): string | undefined {
  const value = readAll()[hostPinId(host, port)];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function writeHostPin(host: string, port: number, fingerprint: string): void {
  try {
    const parsed = readAll();
    parsed[hostPinId(host, port)] = fingerprint;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Private mode or a full disk should not block the session.
  }
}

export function forgetHostPin(host: string, port: number): void {
  try {
    const parsed = readAll();
    delete parsed[hostPinId(host, port)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage failures.
  }
}
