import { ScheduledPayloadJob } from '../types';

export const DEFAULT_SCHEDULER_PRESETS: Omit<ScheduledPayloadJob, 'id' | 'createdAt' | 'runCount' | 'history'>[] = [
  {
    name: 'Periodic Reconnaissance Sweep',
    description: 'Scans 2.4GHz & 5GHz channels via wlan1mon and logs discovered SSIDs and BSSIDs.',
    language: 'bash',
    triggerType: 'interval',
    intervalMinutes: 15,
    cronExpression: '*/15 * * * *',
    targetEngine: 'app',
    enabled: true,
    code: `#!/bin/sh
# WiFi Pineapple Periodic Wireless Recon Sweep
MON_IF="wlan1mon"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="/tmp/recon_logs"

mkdir -p "$LOG_DIR"
echo "=== [ $TIMESTAMP ] WIRELESS RECON SWEEP ==="

if ! ifconfig "$MON_IF" >/dev/null 2>&1; then
    echo "[!] Bringing up $MON_IF..."
    airmon-ng start wlan1 2>/dev/null || true
fi

echo "[+] Scanning active BSSIDs and beacons..."
iw dev "$MON_IF" scan 2>/dev/null | grep -E "(SSID:|BSS|signal:)" | head -n 40 | tee "$LOG_DIR/scan_$TIMESTAMP.log"

echo "[+] Recon sweep completed. Output cached in $LOG_DIR."`,
  },
  {
    name: 'PineAP Client Associations Watchdog',
    description: 'Checks PineAP daemon status, active karma rogue AP associations, and DHCP client leases.',
    language: 'bash',
    triggerType: 'interval',
    intervalMinutes: 10,
    cronExpression: '*/10 * * * *',
    targetEngine: 'app',
    enabled: true,
    code: `#!/bin/sh
# WiFi Pineapple Client Association & PineAP Watchdog
echo "=== PINEAP CLIENT WATCHDOG ==="
echo "Timestamp: $(date)"

if command -v pineap >/dev/null 2>&1; then
    echo "[+] Querying PineAP Daemon..."
    pineap get_status
else
    echo "[-] PineAP binary not found. Checking hostapd interfaces:"
    iw dev
fi

echo ""
echo "=== ACTIVE DHCP LEASES (dnsmasq) ==="
if [ -f /tmp/dhcp.leases ]; then
    cat /tmp/dhcp.leases
else
    echo "No active DHCP leases found."
fi

echo ""
echo "=== ARP CACHE ==="
cat /proc/net/arp`,
  },
  {
    name: 'OpenWrt Hardware Storage & Health Audit',
    description: 'Monitors CPU load average, RAM buffer levels, and SD card / overlay filesystem utilization.',
    language: 'bash',
    triggerType: 'interval',
    intervalMinutes: 30,
    cronExpression: '*/30 * * * *',
    targetEngine: 'openwrt-cron',
    enabled: false,
    code: `#!/bin/sh
# WiFi Pineapple Hardware Health & Storage Monitor
echo "=== OPENWRT SYSTEM HEALTH AUDIT ==="
echo "Host: $(uname -n) | Kernel: $(uname -r)"
uptime

echo ""
echo "=== MEMORY CONSUMPTION ==="
free -m 2>/dev/null || free

echo ""
echo "=== STORAGE & PARTITION USAGE ==="
df -h

echo ""
echo "=== THERMAL & WIRELESS WARNINGS ==="
dmesg | grep -iE "(ath9k|wireless|oom|overheat|voltage|error)" | tail -n 15`,
  },
  {
    name: 'PineAP SSID Pool Auto-Refresh',
    description: 'Ensures target SSID pool is populated with common enterprise & public hotspot profiles.',
    language: 'bash',
    triggerType: 'interval',
    intervalMinutes: 60,
    cronExpression: '0 * * * *',
    targetEngine: 'app',
    enabled: false,
    code: `#!/bin/sh
# WiFi Pineapple PineAP SSID Pool Refresh
echo "=== PINEAP SSID POOL REFRESH ==="

if command -v pineap >/dev/null 2>&1; then
    echo "[+] Verifying SSID pool status..."
    pineap get_status | grep -i "pool" || true
    
    # Reload broadcast state
    pineap ap_pool enable
    pineap beacon_response enable
    echo "[+] PineAP SSID broadcast state synchronized."
else
    echo "[-] pineap command unavailable on this target."
fi`,
  },
];
