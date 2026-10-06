import assert from 'node:assert/strict';
import { LIVE_STATUS_COMMAND, cronInitCommand, describeActivity, parseLiveStatus } from '../src/utils/liveStatus.ts';

const sample = `
===UPTIME===
 12:01:02 up 3 days, load average: 0.10, 0.20, 0.30
===PINEAP===
status: active
ap pool: enabled
karma: enabled
12 SSIDs
===SSIDS===
LabNet
ssid='Cafe'
===CLIENTS===
1700000000 aa:bb:cc:dd:ee:ff 172.16.42.10 laptop *
NO_LEASES
===STATIONS===
IFACE wlan0
Station 11:22:33:44:55:66 (on wlan0)
===PROCS===
  PID USER COMMAND
  12 root /usr/sbin/pineap
  40 root /usr/sbin/dnsmasq
  88 root tcpdump -i wlan0
===CRON===
# comment
*/15 * * * * /root/payloads/health.sh
===CRONSVC===
enabled
===SURVEY===
RUNNING
BSS 00:11:22:33:44:55
`;

const parsed = parseLiveStatus(sample);
assert.equal(parsed.pineapEnabled, true);
assert.equal(parsed.broadcasting, true);
assert.equal(parsed.ssidCount, 12);
assert.deepEqual(parsed.ssids, ['LabNet', 'Cafe']);
assert.equal(parsed.clients.length, 2);
assert.deepEqual(parsed.processes.map((item) => item.name), ['pineap', 'dnsmasq']);
assert.equal(parsed.cronLines.length, 1);
assert.equal(parsed.cronService, 'enabled');
assert.equal(parsed.surveyRunning, true);
assert.match(parsed.summary, /broadcasting 12 SSIDs/);
assert.equal(cronInitCommand('stop'), '/etc/init.d/cron stop');
assert.match(LIVE_STATUS_COMMAND, /list_ssids/);
assert.doesNotMatch(LIVE_STATUS_COMMAND, /deauth|hccapx|evilportal|tcpdump/);

const paused = describeActivity({
  pineapKnown: true,
  pineapEnabled: false,
  broadcasting: false,
  ssidCount: 0,
  clientCount: 0,
  surveyRunning: false,
  processNames: [],
  armedJobs: 2,
  schedulerRunning: false,
  cronService: 'disabled',
});
assert.match(paused, /PineAP is stopped/);
assert.match(paused, /scheduler is paused/);

console.log('verified live status parsing');
