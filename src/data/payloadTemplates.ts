import { PayloadTemplate } from '../types';

export const INITIAL_PAYLOAD_TEMPLATES: PayloadTemplate[] = [
  {
    id: 'pineap-status',
    name: 'PineAP Status Check',
    category: 'pineap',
    description: 'Query the operational status of the PineAP engine, beacon broadcaster, active SSIDs, and client targets.',
    author: 'Hak5 Official',
    notes: 'Non-disruptive query; checks both pineap binary and OpenWrt UCI configuration.',
    tags: ['pineap', 'status', 'recon'],
    language: 'bash',
    code: `#!/bin/sh
# =============================================================================
# Title       : PineAP Status Check
# Description : Query the operational status of the PineAP engine and beacon broadcaster
# Author      : Hak5 Official
# Notes       : Non-disruptive query; safe to execute at any interval
# =============================================================================

echo "=== PINEAP SUITE STATUS ==="
if command -v pineap >/dev/null 2>&1; then
    pineap get_status
else
    echo "pineap binary not found on standard PATH. Checking UCI config..."
    uci show pineap 2>/dev/null || echo "UCI pineap config unavailable"
fi

echo ""
echo "=== ACTIVE WIRELESS INTERFACES ==="
ifconfig | grep -E "^[a-zA-Z0-9]+"`,
  },
  {
    id: 'pineap-toggle-start',
    name: 'Enable PineAP Suite',
    category: 'pineap',
    description: 'Start PineAP daemon, activate Karma response engine, and broadcast the AP SSID pool on wlan0.',
    author: 'Hak5 Official',
    notes: 'Brings up PineAP on primary wireless radio. Ensure regulatory compliance for broadcasting.',
    tags: ['pineap', 'karma', 'broadcast'],
    language: 'bash',
    code: `#!/bin/sh
# =============================================================================
# Title       : Enable PineAP Suite
# Description : Start PineAP daemon, activate Karma response engine, and broadcast AP pool
# Author      : Hak5 Official
# Notes       : Brings up PineAP on primary wireless radio wlan0
# =============================================================================

echo "[+] Starting PineAP daemon..."
pineap enable
pineap start

echo "[+] Setting PineAP features: Karma & AP Pool..."
pineap set_target FF:FF:FF:FF:FF:FF
pineap beacon_response enable
pineap ap_pool enable

echo "[+] Current PineAP Status:"
pineap get_status`,
  },
  {
    id: 'recon-scan-quick',
    name: 'Wireless Recon & AP Scan',
    category: 'recon',
    description: 'Perform a 2.4GHz & 5GHz passive frequency sweep to capture nearby BSSIDs, SSIDs, and signal power.',
    author: 'Hak5 / Operator',
    notes: 'Requires monitor interface wlan1mon. Automatically attempts airmon-ng start if missing.',
    tags: ['recon', 'iw', 'scan', 'airmon-ng'],
    language: 'bash',
    code: `#!/bin/sh
# =============================================================================
# Title       : Wireless Recon & AP Scan
# Description : Passive wireless survey using monitor mode to map nearby access points
# Author      : Hak5 / Operator
# Notes       : Uses monitor interface wlan1mon; runs non-intrusively
# =============================================================================

MON_IF="wlan1mon"

if ! ifconfig "$MON_IF" >/dev/null 2>&1; then
    echo "[!] Monitor interface $MON_IF not active. Attempting airmon-ng start..."
    airmon-ng start wlan1 2>/dev/null || true
fi

echo "=== SCANNING SURROUNDING APs (iw dev) ==="
iw dev "$MON_IF" scan | grep -E "(SSID:|BSS|signal:)" | head -n 35`,
  },
  {
    id: 'interface-mac-changer',
    name: 'Randomize MAC Address',
    category: 'interface',
    description: 'Temporarily bring down interface wlan1, apply a randomized hardware MAC address, and restore link state.',
    author: 'OpSec Team',
    notes: 'Falls back to /dev/urandom hex generation if macchanger package is not installed.',
    tags: ['interface', 'macchanger', 'opsec'],
    language: 'bash',
    code: `#!/bin/sh
# =============================================================================
# Title       : Randomize MAC Address
# Description : Temporarily bring down interface wlan1, spoof MAC, and restore link
# Author      : OpSec Team
# Notes       : Use prior to initiating client associations or monitoring
# =============================================================================

IFACE="wlan1"

echo "[+] Bringing down $IFACE..."
ifconfig $IFACE down

if command -v macchanger >/dev/null 2>&1; then
    echo "[+] Randomizing MAC address via macchanger..."
    macchanger -r $IFACE
else
    echo "[!] macchanger not found. Generating random MAC via /dev/urandom..."
    NEW_MAC=$(hexdump -n 6 -e '4/1 "%02X:" 2/1 "%02X"' /dev/urandom)
    ifconfig $IFACE hw ether "$NEW_MAC"
fi

echo "[+] Bringing up $IFACE..."
ifconfig $IFACE up
ifconfig $IFACE | grep HWaddr`,
  },
  {
    id: 'system-diag-health',
    name: 'Full Hardware & Storage Health Check',
    category: 'system',
    description: 'Inspect CPU load, RAM usage, storage mount points, SD card availability, and top OpenWrt processes.',
    author: 'SysAdmin',
    notes: 'Comprehensive audit script; safe for regular scheduling.',
    tags: ['health', 'storage', 'sysinfo', 'cpu'],
    language: 'bash',
    code: `#!/bin/sh
# =============================================================================
# Title       : Full Hardware & Storage Health Check
# Description : Inspect CPU load, memory usage, SD card partition, and processes
# Author      : SysAdmin
# Notes       : Lightweight telemetry check for Mark VII / Enterprise hardware
# =============================================================================

echo "=== SYSTEM & HARDWARE INFO ==="
uname -a
uptime

echo ""
echo "=== MEMORY UTILIZATION ==="
free -m 2>/dev/null || free

echo ""
echo "=== DISK & SD CARD STORAGE ==="
df -h

echo ""
echo "=== NETWORK INTERFACES & IPs ==="
ifconfig -a | grep -A 1 -E "^[a-zA-Z0-9]+"

echo ""
echo "=== TOP PROCESSES ==="
ps | head -n 15`,
  },
  {
    id: 'tail-pineap-logs',
    name: 'Tail PineAP & DHCP Logs',
    category: 'system',
    description: 'Extract recent log entries for wireless station connections, DHCP leases, hostapd events, and PineAP triggers.',
    author: 'Hak5 Official',
    notes: 'Filters OpenWrt logread circular buffer with regex pattern matching.',
    tags: ['logs', 'dhcp', 'hostapd', 'pineap'],
    language: 'bash',
    code: `#!/bin/sh
# =============================================================================
# Title       : Tail PineAP & DHCP Logs
# Description : Extract recent log entries for client connections and hostapd events
# Author      : Hak5 Official
# Notes       : Circular buffer logread filter
# =============================================================================

echo "=== RECENT SYSTEM LOGS (logread) ==="
logread | grep -E -i "(pineap|dhcp|hostapd|wlan|station)" | tail -n 30`,
  },
  {
    id: 'python-probe-logger',
    name: 'Python Probe Request Parser',
    category: 'custom',
    description: 'Python script to inspect device system release metadata, memory counters, and wireless interface statistics.',
    author: 'DevOps / Python',
    notes: 'Requires Python 3 runtime on OpenWrt (opkg install python3).',
    tags: ['python', 'parser', 'diagnostics'],
    language: 'python',
    code: `#!/usr/bin/env python3
"""
==============================================================================
Title       : Python Probe Request Parser
Description : Inspect device system release metadata and memory snapshot
Author      : DevOps / Python
Notes       : Requires Python 3 runtime on OpenWrt
==============================================================================
"""
import os
import sys
import datetime

print("=== WIFI PINEAPPLE PYTHON RUNNER ===")
print(f"Current System Time: {datetime.datetime.now()}")
print(f"Python Version: {sys.version}")

# Inspect OpenWrt release file
try:
    with open("/etc/openwrt_release", "r") as f:
        print("\n=== OpenWrt Release Info ===")
        print(f.read().strip())
except Exception as e:
    print(f"Could not read /etc/openwrt_release: {e}")

# Check available memory snapshot
try:
    with open("/proc/meminfo", "r") as f:
        print("\n=== Memory Snapshot ===")
        lines = f.readlines()[:4]
        for line in lines:
            print(line.strip())
except Exception as e:
    print(f"Proc read error: {e}")
`,
  },
];
