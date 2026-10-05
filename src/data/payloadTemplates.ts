import { PayloadTemplate } from '../types';

const header = (title: string, description: string) => `#!/bin/sh
# =============================================================================
# Title       : ${title}
# Description : ${description}
# Author      : PINESSHREMO
# Notes       : POSIX /bin/sh for BusyBox ash. No base64, bash, or extra packages.
# =============================================================================
`;

export const INITIAL_PAYLOAD_TEMPLATES: PayloadTemplate[] = [
  {
    id: 'pineap-status',
    name: 'PineAP Status',
    category: 'pineap',
    description: 'Read PineAP status with the Mark VII verb, then the 6th-gen config-path form, then UCI.',
    author: 'PINESSHREMO',
    notes: 'Read-only. Tries pineap get_status, pineap status, and pineap /tmp/pineap.conf get_status.',
    tags: ['pineap', 'status'],
    language: 'bash',
    code: `${header('PineAP Status', 'Read PineAP status from the CLI that this firmware accepts')}
echo "=== PINEAP STATUS ==="
if ! command -v pineap >/dev/null 2>&1; then
  echo "pineap not found on PATH"
else
  pineap get_status 2>/dev/null || pineap status 2>/dev/null || {
    if [ -f /tmp/pineap.conf ]; then
      pineap /tmp/pineap.conf get_status 2>/dev/null || echo "pineap get_status was rejected"
    else
      echo "get_status was rejected and /tmp/pineap.conf is missing"
      pineap help 2>&1 | head -n 25
    fi
  }
fi
echo "=== UCI pineap ==="
uci show pineap 2>/dev/null || echo "uci pineap unavailable"
`,
  },
  {
    id: 'pineap-start',
    name: 'Start PineAP Suite',
    category: 'pineap',
    description: 'Start the PineAP suite with the verbs this app already uses, then documented karma and pool names.',
    author: 'PINESSHREMO',
    notes: 'Same start, beacon, and pool switches as the dashboard. No new targeting.',
    tags: ['pineap', 'start'],
    language: 'bash',
    code: `${header('Start PineAP Suite', 'Start PineAP with the verbs this controller already sends')}
if ! command -v pineap >/dev/null 2>&1; then
  echo "pineap not found on PATH"
  exit 0
fi
if pineap get_status >/dev/null 2>&1; then
  pineap enable 2>/dev/null || true
  pineap start 2>/dev/null || true
  pineap beacon_response enable 2>/dev/null || pineap beacon_responses on 2>/dev/null || true
  pineap ap_pool enable 2>/dev/null || pineap broadcast_pool on 2>/dev/null || true
  pineap get_status 2>/dev/null || pineap status 2>/dev/null || true
elif [ -f /tmp/pineap.conf ]; then
  pineap /tmp/pineap.conf karma on
  pineap /tmp/pineap.conf beacon_responses on
  pineap /tmp/pineap.conf broadcast_pool on
  pineap /tmp/pineap.conf get_status
else
  pineap karma on 2>/dev/null || true
  pineap start 2>/dev/null || true
  pineap get_status 2>/dev/null || pineap help 2>&1 | head -n 20
fi
`,
  },
  {
    id: 'pineap-stop',
    name: 'Stop PineAP Suite',
    category: 'pineap',
    description: 'Stop PineAP with disable, stop, and karma off so both CLI generations land in a stopped state.',
    author: 'PINESSHREMO',
    notes: 'Matches the dashboard stop action and the 6th-gen karma off verb.',
    tags: ['pineap', 'stop'],
    language: 'bash',
    code: `${header('Stop PineAP Suite', 'Stop PineAP on Mark VII and 6th-gen CLI')}
if ! command -v pineap >/dev/null 2>&1; then
  echo "pineap not found on PATH"
  exit 0
fi
pineap disable 2>/dev/null || true
pineap stop 2>/dev/null || true
pineap karma off 2>/dev/null || true
if [ -f /tmp/pineap.conf ]; then
  pineap /tmp/pineap.conf karma off 2>/dev/null || true
fi
echo "=== STATUS AFTER STOP ==="
pineap get_status 2>/dev/null || pineap status 2>/dev/null || pineap /tmp/pineap.conf get_status 2>/dev/null || echo "stopped"
`,
  },
  {
    id: 'pineap-ssids',
    name: 'List PineAP SSID Pool',
    category: 'pineap',
    description: 'Print the configured SSID pool with list_ssids, or UCI if that verb is absent.',
    author: 'PINESSHREMO',
    notes: 'Read-only. Does not add or broadcast names.',
    tags: ['pineap', 'ssid'],
    language: 'bash',
    code: `${header('List PineAP SSID Pool', 'Read the SSID pool without changing it')}
if command -v pineap >/dev/null 2>&1; then
  pineap list_ssids 2>/dev/null || pineap /tmp/pineap.conf list_ssids 2>/dev/null || echo "list_ssids was rejected"
else
  echo "pineap not found on PATH"
fi
echo "=== UCI ssid entries ==="
if command -v uci >/dev/null 2>&1; then
  uci show pineap 2>/dev/null | grep -i ssid || echo "no ssid keys in uci pineap"
else
  echo "uci not found"
fi
`,
  },
  {
    id: 'pineap-probes',
    name: 'List PineAP Probes',
    category: 'recon',
    description: 'Print probe names PineAP has already logged, using list_probes when the firmware provides it.',
    author: 'PINESSHREMO',
    notes: 'Read-only listing of the existing PineAP probe table.',
    tags: ['pineap', 'probes'],
    language: 'bash',
    code: `${header('List PineAP Probes', 'Read the probe table PineAP already keeps')}
if ! command -v pineap >/dev/null 2>&1; then
  echo "pineap not found on PATH"
  exit 0
fi
pineap list_probes 2>/dev/null || pineap /tmp/pineap.conf list_probes 2>/dev/null || echo "list_probes was rejected on this firmware"
`,
  },
  {
    id: 'pineap-scan',
    name: 'PineAP Scan Helper',
    category: 'recon',
    description: 'Run pineap run_scan for 10 seconds on both bands when that verb exists, otherwise survey with iw.',
    author: 'PINESSHREMO',
    notes: 'Uses the documented run_scan verb only. Falls back to iw or iwinfo on the live interface.',
    tags: ['pineap', 'scan', 'iw'],
    language: 'bash',
    code: `${header('PineAP Scan Helper', 'Short site survey via pineap run_scan or iw')}
ran=0
if command -v pineap >/dev/null 2>&1; then
  help=$(pineap help 2>&1 || true)
  if printf '%s\\n' "$help" | grep -q run_scan; then
    echo "=== pineap run_scan 10 2 ==="
    pineap run_scan 10 2 && ran=1
  elif [ -f /tmp/pineap.conf ]; then
    help2=$(pineap /tmp/pineap.conf help 2>&1 || true)
    if printf '%s\\n' "$help2" | grep -q run_scan; then
      echo "=== pineap /tmp/pineap.conf run_scan 10 2 ==="
      pineap /tmp/pineap.conf run_scan 10 2 && ran=1
    fi
  fi
fi
if [ "$ran" -eq 0 ]; then
  echo "=== pineap run_scan unavailable; using iw/iwinfo ==="
  IFACE=""
  if command -v iw >/dev/null 2>&1; then
    IFACE=$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')
  fi
  if [ -z "$IFACE" ]; then
    for cand in wlan0 wlan1 wlan0-1; do
      if ifconfig "$cand" >/dev/null 2>&1; then
        IFACE=$cand
        break
      fi
    done
  fi
  if [ -n "$IFACE" ] && command -v iwinfo >/dev/null 2>&1; then
    echo "iwinfo $IFACE scan"
    iwinfo "$IFACE" scan 2>/dev/null | head -n 40
  elif [ -n "$IFACE" ] && command -v iw >/dev/null 2>&1; then
    echo "iw dev $IFACE scan"
    iw dev "$IFACE" scan 2>/dev/null | head -n 40
  else
    echo "No pineap run_scan and no iw/iwinfo interface"
    ifconfig 2>/dev/null || true
  fi
fi
`,
  },
  {
    id: 'wifi-interfaces',
    name: 'Wireless Interface List',
    category: 'interface',
    description: 'List wireless devices with iw, iwinfo, and ifconfig. No monitor-mode package is required.',
    author: 'PINESSHREMO',
    notes: 'Replaces airmon-ng, which is not installed on the Pineapple image.',
    tags: ['iw', 'ifconfig', 'interface'],
    language: 'bash',
    code: `${header('Wireless Interface List', 'Show radios with tools that ship on OpenWrt')}
echo "=== iw dev ==="
if command -v iw >/dev/null 2>&1; then
  iw dev
else
  echo "iw not found"
fi
echo "=== iwinfo ==="
if command -v iwinfo >/dev/null 2>&1; then
  iwinfo
else
  echo "iwinfo not found"
fi
echo "=== ifconfig ==="
ifconfig
`,
  },
  {
    id: 'wifi-link',
    name: 'Link And Signal Status',
    category: 'interface',
    description: 'Show association, signal, and hardware address for each live wireless interface.',
    author: 'PINESSHREMO',
    notes: 'Read-only iw link / iwinfo. Does not change the MAC address.',
    tags: ['iw', 'signal', 'link'],
    language: 'bash',
    code: `${header('Link And Signal Status', 'Read link and signal without changing the interface')}
if command -v iwinfo >/dev/null 2>&1; then
  echo "=== iwinfo ==="
  iwinfo
fi
if command -v iw >/dev/null 2>&1; then
  echo "=== iw dev ==="
  iw dev
  for iface in $(iw dev 2>/dev/null | awk '/Interface/{print $2}'); do
    echo "=== $iface ==="
    iw dev "$iface" info 2>/dev/null || true
    iw dev "$iface" link 2>/dev/null || true
    iw dev "$iface" station dump 2>/dev/null | head -n 20 || true
  done
else
  echo "iw not found"
fi
echo "=== ifconfig ==="
ifconfig
`,
  },
  {
    id: 'wifi-survey',
    name: 'Nearby AP Survey',
    category: 'recon',
    description: 'Survey nearby access points on the existing managed interface with iw or iwinfo.',
    author: 'PINESSHREMO',
    notes: 'Does not start a monitor interface. airmon-ng is not used.',
    tags: ['recon', 'iw', 'survey'],
    language: 'bash',
    code: `${header('Nearby AP Survey', 'Scan from the interface that is already up')}
IFACE=""
if command -v iw >/dev/null 2>&1; then
  IFACE=$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')
fi
if [ -z "$IFACE" ]; then
  for cand in wlan0 wlan1 wlan0-1; do
    if ifconfig "$cand" >/dev/null 2>&1; then
      IFACE=$cand
      break
    fi
  done
fi
if [ -z "$IFACE" ]; then
  echo "No wireless interface found"
  ifconfig 2>/dev/null || true
  exit 0
fi
echo "Survey interface: $IFACE"
if command -v iwinfo >/dev/null 2>&1; then
  iwinfo "$IFACE" scan 2>/dev/null | head -n 50
elif command -v iw >/dev/null 2>&1; then
  iw dev "$IFACE" scan 2>/dev/null | head -n 50
else
  echo "iw and iwinfo are both missing"
  ifconfig "$IFACE"
fi
`,
  },
  {
    id: 'firmware-identity',
    name: 'Firmware Identity',
    category: 'system',
    description: 'Print kernel, OpenWrt release, and Pineapple version files when those paths exist.',
    author: 'PINESSHREMO',
    notes: 'Read-only identity check for Mark VII and earlier OpenWrt images.',
    tags: ['firmware', 'uname', 'openwrt'],
    language: 'bash',
    code: `${header('Firmware Identity', 'Show firmware and kernel identity')}
uname -a
echo "=== /etc/openwrt_release ==="
if [ -f /etc/openwrt_release ]; then
  cat /etc/openwrt_release
else
  echo "missing"
fi
echo "=== Pineapple version files ==="
found=0
for f in /etc/pineapple/pineapple_version /etc/pineapple_version /pineapple/pineapple_version /etc/pineapple/version; do
  if [ -f "$f" ]; then
    found=1
    echo "-- $f"
    cat "$f"
  fi
done
if [ "$found" -eq 0 ]; then
  echo "no pineapple version file"
fi
echo "=== cpu ==="
head -n 8 /proc/cpuinfo 2>/dev/null || true
`,
  },
  {
    id: 'uptime-load',
    name: 'Uptime And Load',
    category: 'system',
    description: 'Show how long the device has been up and the 1, 5, and 15 minute load averages.',
    author: 'PINESSHREMO',
    notes: 'Uses uptime and /proc/loadavg. The first metrics sample stays pending until a second read.',
    tags: ['uptime', 'load'],
    language: 'bash',
    code: `${header('Uptime And Load', 'Read uptime and load average')}
uptime
echo "=== /proc/loadavg ==="
cat /proc/loadavg 2>/dev/null || echo "no /proc/loadavg"
`,
  },
  {
    id: 'memory',
    name: 'Memory',
    category: 'system',
    description: 'Show RAM from free, and from /proc/meminfo when BusyBox free has no -m flag.',
    author: 'PINESSHREMO',
    notes: 'BusyBox free without -m reports kilobytes. Both forms are printed.',
    tags: ['memory', 'free'],
    language: 'bash',
    code: `${header('Memory', 'Read RAM from free and /proc/meminfo')}
echo "=== free ==="
free -m 2>/dev/null || free
echo "=== /proc/meminfo ==="
head -n 8 /proc/meminfo 2>/dev/null || echo "no /proc/meminfo"
`,
  },
  {
    id: 'storage-sd',
    name: 'Storage And SD Card',
    category: 'system',
    description: 'Show filesystem use, mount table, and the SD or overlay directories Pineapple images use.',
    author: 'PINESSHREMO',
    notes: 'Checks /sd, /sdcard, /mnt/sd, /overlay, and /tmp without formatting anything.',
    tags: ['df', 'sd', 'storage'],
    language: 'bash',
    code: `${header('Storage And SD Card', 'Read disk use and SD mount paths')}
echo "=== df ==="
df -h 2>/dev/null || df
echo "=== mount ==="
mount
echo "=== paths ==="
for p in /sd /sdcard /mnt/sd /mnt/sda1 /overlay /tmp; do
  if [ -d "$p" ]; then
    echo "-- $p"
    ls -la "$p" 2>/dev/null | head -n 12
  else
    echo "missing $p"
  fi
done
`,
  },
  {
    id: 'dhcp-leases',
    name: 'DHCP Leases',
    category: 'system',
    description: 'Print the dnsmasq lease file so associated clients on your Pineapple network are visible.',
    author: 'PINESSHREMO',
    notes: 'Reads /tmp/dhcp.leases only.',
    tags: ['dhcp', 'leases'],
    language: 'bash',
    code: `${header('DHCP Leases', 'Read dnsmasq leases')}
if [ -f /tmp/dhcp.leases ]; then
  cat /tmp/dhcp.leases
else
  echo "no /tmp/dhcp.leases"
fi
`,
  },
  {
    id: 'arp-table',
    name: 'ARP Table',
    category: 'system',
    description: 'Print the kernel ARP table for hosts the Pineapple has already talked to.',
    author: 'PINESSHREMO',
    notes: 'Reads /proc/net/arp. Does not send probes.',
    tags: ['arp'],
    language: 'bash',
    code: `${header('ARP Table', 'Read the kernel neighbor table')}
if [ -f /proc/net/arp ]; then
  cat /proc/net/arp
else
  echo "no /proc/net/arp"
fi
`,
  },
  {
    id: 'routes',
    name: 'Routing Table',
    category: 'system',
    description: 'Show the IPv4 routing table with route, ip route, or /proc/net/route.',
    author: 'PINESSHREMO',
    notes: 'BusyBox route is preferred. /proc/net/route is the fallback that always exists on Linux.',
    tags: ['route', 'network'],
    language: 'bash',
    code: `${header('Routing Table', 'Read the IPv4 route table')}
if command -v route >/dev/null 2>&1; then
  route -n
elif command -v ip >/dev/null 2>&1; then
  ip route
elif [ -f /proc/net/route ]; then
  cat /proc/net/route
else
  echo "no route table"
fi
`,
  },
  {
    id: 'uci-wireless',
    name: 'UCI Wireless',
    category: 'interface',
    description: 'Print the OpenWrt wireless config the radios are actually using.',
    author: 'PINESSHREMO',
    notes: 'uci show is read-only. It does not commit changes.',
    tags: ['uci', 'wireless'],
    language: 'uci',
    code: `${header('UCI Wireless', 'Read wireless config')}
if command -v uci >/dev/null 2>&1; then
  uci show wireless 2>&1 || echo "uci show wireless failed"
else
  echo "uci not found"
fi
`,
  },
  {
    id: 'uci-network',
    name: 'UCI Network',
    category: 'interface',
    description: 'Print the OpenWrt network section, including LAN and management addresses.',
    author: 'PINESSHREMO',
    notes: 'Read-only. Useful when the management IP is not the usual 172.16.42.1.',
    tags: ['uci', 'network'],
    language: 'uci',
    code: `${header('UCI Network', 'Read network config')}
if command -v uci >/dev/null 2>&1; then
  uci show network 2>&1 || echo "uci show network failed"
else
  echo "uci not found"
fi
`,
  },
  {
    id: 'system-logs',
    name: 'System Logs',
    category: 'system',
    description: 'Show recent logread lines for PineAP, DHCP, and wireless, plus the tail of dmesg.',
    author: 'PINESSHREMO',
    notes: 'Uses grep -i -e, which BusyBox has. Does not use grep -A, -P, or -o.',
    tags: ['logread', 'dmesg'],
    language: 'bash',
    code: `${header('System Logs', 'Read recent userspace and kernel log lines')}
echo "=== logread ==="
if command -v logread >/dev/null 2>&1; then
  matched=$(logread 2>/dev/null | tail -n 120 | grep -i -e pineap -e dhcp -e hostapd -e wlan -e station || true)
  if [ -n "$matched" ]; then
    printf '%s\\n' "$matched"
  else
    logread 2>/dev/null | tail -n 30
  fi
else
  echo "logread not found"
fi
echo "=== dmesg ==="
if command -v dmesg >/dev/null 2>&1; then
  dmesg 2>/dev/null | tail -n 25
else
  echo "dmesg not found"
fi
`,
  },
  {
    id: 'processes-cron',
    name: 'Processes And Crontab',
    category: 'system',
    description: 'List running processes and the root crontab the scheduler writes on the device.',
    author: 'PINESSHREMO',
    notes: 'Reads ps and /etc/crontabs/root. Does not install or delete jobs.',
    tags: ['ps', 'cron'],
    language: 'bash',
    code: `${header('Processes And Crontab', 'Read process list and root crontab')}
echo "=== ps ==="
ps
echo "=== crontab ==="
if command -v crontab >/dev/null 2>&1; then
  crontab -l 2>/dev/null || echo "crontab -l returned nothing"
fi
if [ -f /etc/crontabs/root ]; then
  echo "-- /etc/crontabs/root"
  cat /etc/crontabs/root
else
  echo "no /etc/crontabs/root"
fi
`,
  },
];
