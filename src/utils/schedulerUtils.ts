import { ScheduledPayloadJob } from '../types';

/**
 * Calculates human-readable description of a schedule
 */
export function describeSchedule(job: ScheduledPayloadJob): string {
  if (job.triggerType === 'once') {
    if (!job.runAt) return 'One-time (unscheduled)';
    try {
      const date = new Date(job.runAt);
      return `One-time: ${date.toLocaleString()}`;
    } catch {
      return `One-time: ${job.runAt}`;
    }
  }

  if (job.triggerType === 'interval') {
    const mins = job.intervalMinutes || 15;
    if (mins < 60) {
      return `Every ${mins} minute${mins > 1 ? 's' : ''}`;
    }
    const hours = Math.round(mins / 60);
    if (hours < 24) {
      return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
    }
    const days = Math.round(hours / 24);
    return `Every ${days} day${days > 1 ? 's' : ''}`;
  }

  if (job.triggerType === 'cron') {
    return `Cron: ${job.cronExpression || '* * * * *'}`;
  }

  return 'Custom schedule';
}

/**
 * Converts interval in minutes to standard cron expression
 */
export function intervalToCronExpression(minutes: number): string {
  if (minutes <= 0) return '* * * * *';
  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `0 */${hours} * * *`;
  }
  const days = Math.floor(hours / 24);
  return `0 0 */${days} * *`;
}

/**
 * Calculates the next run time for a job
 */
export function calculateNextRunTime(job: ScheduledPayloadJob, fromDate: Date = new Date()): Date | null {
  if (!job.enabled) return null;

  if (job.triggerType === 'once') {
    if (!job.runAt) return null;
    const targetDate = new Date(job.runAt);
    if (targetDate.getTime() <= fromDate.getTime()) {
      // If already ran or in past
      if (job.runCount > 0) return null;
      return targetDate;
    }
    return targetDate;
  }

  if (job.triggerType === 'interval') {
    const intervalMs = (job.intervalMinutes || 15) * 60 * 1000;
    if (job.lastRunAt) {
      const lastRun = new Date(job.lastRunAt).getTime();
      const nextTime = lastRun + intervalMs;
      if (nextTime > fromDate.getTime()) {
        return new Date(nextTime);
      }
    }
    return new Date(fromDate.getTime() + intervalMs);
  }

  if (job.triggerType === 'cron') {
    // Parse simple cron patterns
    const expr = (job.cronExpression || '*/15 * * * *').trim();
    const parts = expr.split(/\s+/);
    if (parts.length >= 5) {
      const minPart = parts[0];
      if (minPart.startsWith('*/')) {
        const step = parseInt(minPart.replace('*/', ''), 10) || 15;
        const currentMin = fromDate.getMinutes();
        const nextMin = Math.ceil((currentMin + 1) / step) * step;
        const nextDate = new Date(fromDate);
        nextDate.setSeconds(0);
        nextDate.setMilliseconds(0);
        if (nextMin >= 60) {
          nextDate.setHours(nextDate.getHours() + 1);
          nextDate.setMinutes(nextMin % 60);
        } else {
          nextDate.setMinutes(nextMin);
        }
        return nextDate;
      }
    }
    // Fallback: 15 minutes from now
    return new Date(fromDate.getTime() + 15 * 60 * 1000);
  }

  return null;
}

/**
 * Formats time remaining in mm:ss or hh:mm:ss or "Due now"
 */
export function formatTimeRemaining(nextRunIso?: string): { text: string; isPast: boolean } {
  if (!nextRunIso) return { text: 'Not scheduled', isPast: false };

  const now = Date.now();
  const target = new Date(nextRunIso).getTime();
  const diffMs = target - now;

  if (isNaN(target)) return { text: 'Invalid date', isPast: false };

  if (diffMs <= 0) {
    const pastSec = Math.abs(Math.floor(diffMs / 1000));
    if (pastSec < 60) return { text: 'Due now', isPast: true };
    const pastMin = Math.floor(pastSec / 60);
    return { text: `${pastMin}m ago`, isPast: true };
  }

  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { text: `in ${days}d ${hours % 24}h`, isPast: false };
  }

  if (hours > 0) {
    return {
      text: `in ${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`,
      isPast: false,
    };
  }

  return {
    text: `in ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`,
    isPast: false,
  };
}

/**
 * Generates OpenWrt cron line for WiFi Pineapple
 */
export function generateOpenWrtCronLine(job: ScheduledPayloadJob): string {
  let cronExpr = '*/15 * * * *';

  if (job.triggerType === 'interval') {
    cronExpr = intervalToCronExpression(job.intervalMinutes || 15);
  } else if (job.triggerType === 'cron' && job.cronExpression) {
    cronExpr = job.cronExpression.trim();
  } else if (job.triggerType === 'once' && job.runAt) {
    try {
      const d = new Date(job.runAt);
      cronExpr = `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
    } catch {
      cronExpr = '*/30 * * * *';
    }
  }

  const slug = job.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  const scriptPath = `/root/payloads/${slug}.sh`;
  const logPath = `/tmp/${slug}.log`;

  return `${cronExpr} ${scriptPath} >> ${logPath} 2>&1 # WIFIPINEAPPLE_JOB_${job.id}`;
}

/**
 * Generates script deployment commands for OpenWrt hardware
 */
export function generateHardwareDeployCommand(job: ScheduledPayloadJob): string {
  const slug = job.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  const scriptPath = `/root/payloads/${slug}.sh`;
  const base64Code = btoa(unescape(encodeURIComponent(job.code)));
  const cronLine = generateOpenWrtCronLine(job);

  return [
    `mkdir -p /root/payloads`,
    `echo "${base64Code}" | base64 -d > ${scriptPath}`,
    `chmod +x ${scriptPath}`,
    `mkdir -p /etc/crontabs`,
    `touch /etc/crontabs/root`,
    `grep -v "WIFIPINEAPPLE_JOB_${job.id}" /etc/crontabs/root > /tmp/crontab.tmp || true`,
    `echo "${cronLine}" >> /tmp/crontab.tmp`,
    `mv /tmp/crontab.tmp /etc/crontabs/root`,
    `/etc/init.d/cron enable >/dev/null 2>&1 || true`,
    `/etc/init.d/cron restart >/dev/null 2>&1 || /etc/init.d/cron start`,
    `echo "[+] Hardware payload synced to ${scriptPath} and crontab updated."`,
  ].join(' && ');
}

/**
 * Generates command to remove job from hardware OpenWrt crontab
 */
export function generateHardwareRemoveCommand(jobId: string): string {
  return [
    `if [ -f /etc/crontabs/root ]; then`,
    `  grep -v "WIFIPINEAPPLE_JOB_${jobId}" /etc/crontabs/root > /tmp/crontab.tmp || true`,
    `  mv /tmp/crontab.tmp /etc/crontabs/root`,
    `  /etc/init.d/cron restart >/dev/null 2>&1 || true`,
    `fi`,
    `echo "[+] Job removed from /etc/crontabs/root"`,
  ].join('\n');
}
