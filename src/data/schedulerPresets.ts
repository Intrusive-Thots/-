import { ScheduledPayloadJob } from '../types';

export const DEFAULT_SCHEDULER_PRESETS: Omit<ScheduledPayloadJob, 'id' | 'createdAt' | 'runCount' | 'history'>[] = [
  {
    name: 'Periodic Reconnaissance Sweep',
    description: 'Surveys the live wireless interface with iw or iwinfo and logs the first lines of the scan.',
    language: 'bash',
    triggerType: 'interval',
    intervalMinutes: 15,
    cronExpression: '*/15 * * * *',
    targetEngine: 'app',
    enabled: true,
    code: `#!/bin/sh
# Survey the interface that is already up. ash has no airmon-ng.
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="/tmp/recon_logs"
mkdir -p "$LOG_DIR"
IFACE=""
if command -v iw >/dev/null 2>&1; then
  IFACE=$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')
fi
if [ -z "$IFACE" ]; then
  for cand in wlan0 wlan1; do
    if ifconfig "$cand" >/dev/null 2>&1; then
      IFACE=$cand
      break
    fi
  done
fi
echo "=== [ $TIMESTAMP ] survey \${IFACE:-none} ===" | tee "$LOG_DIR/scan_$TIMESTAMP.log"
if [ -z "$IFACE" ]; then
  echo "No wireless interface" | tee -a "$LOG_DIR/scan_$TIMESTAMP.log"
elif command -v iwinfo >/dev/null 2>&1; then
  iwinfo "$IFACE" scan 2>/dev/null | head -n 40 | tee -a "$LOG_DIR/scan_$TIMESTAMP.log"
elif command -v iw >/dev/null 2>&1; then
  iw dev "$IFACE" scan 2>/dev/null | head -n 40 | tee -a "$LOG_DIR/scan_$TIMESTAMP.log"
else
  ifconfig | tee -a "$LOG_DIR/scan_$TIMESTAMP.log"
fi
echo "Saved $LOG_DIR/scan_$TIMESTAMP.log"`,
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
    pineap get_status 2>/dev/null || pineap status 2>/dev/null || pineap /tmp/pineap.conf get_status 2>/dev/null || echo "pineap status verb was rejected"
else
    echo "[-] PineAP binary not found. Checking interfaces:"
    iw dev 2>/dev/null || ifconfig
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
dmesg 2>/dev/null | grep -i -e ath9k -e wireless -e oom -e overheat -e voltage -e error | tail -n 15 || dmesg 2>/dev/null | tail -n 15`,
  },
  {
    name: 'PineAP SSID Pool Auto-Refresh',
    description: 'Re-enables the PineAP pool and beacon switches this app already uses. It does not add SSID names.',
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
    pineap get_status 2>/dev/null | grep -i pool || pineap /tmp/pineap.conf get_status 2>/dev/null | grep -i pool || true
    pineap ap_pool enable 2>/dev/null || pineap broadcast_pool on 2>/dev/null || pineap /tmp/pineap.conf broadcast_pool on 2>/dev/null || true
    pineap beacon_response enable 2>/dev/null || pineap beacon_responses on 2>/dev/null || pineap /tmp/pineap.conf beacon_responses on 2>/dev/null || true
    echo "[+] PineAP pool and beacon switches were refreshed."
else
    echo "[-] pineap command unavailable on this target."
fi`,
  },
];
