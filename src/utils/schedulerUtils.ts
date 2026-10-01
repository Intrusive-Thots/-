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

const CRON_TOKEN = String.raw`(?:\*|\*/[1-9]\d*|\d+(?:-\d+)?)`;
const CRON_FIELD = new RegExp(`^${CRON_TOKEN}(?:,${CRON_TOKEN})*$`);

/** Five-field cron using only numbers, *, lists, ranges, and step values. */
export function isSafeCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  return parts.length === 5 && parts.every((part) => CRON_FIELD.test(part));
}

export function isSafeJobId(jobId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(jobId);
}

function matchCronToken(field: string, value: number): boolean {
  if (field === '*') return true;
  return field.split(',').some((part) => {
    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      return step > 0 && value % step === 0;
    }
    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-');
      const start = parseInt(startRaw, 10);
      const end = parseInt(endRaw, 10);
      return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
    }
    return parseInt(part, 10) === value;
  });
}

function matchDayOfWeek(field: string, day: number): boolean {
  if (matchCronToken(field, day)) return true;
  return day === 0 && matchCronToken(field, 7);
}

function cronMatches(date: Date, parts: string[]): boolean {
  if (!matchCronToken(parts[0], date.getMinutes())) return false;
  if (!matchCronToken(parts[1], date.getHours())) return false;
  if (!matchCronToken(parts[3], date.getMonth() + 1)) return false;

  const dayRestricted = parts[2] !== '*';
  const weekRestricted = parts[4] !== '*';
  const dayMatches = matchCronToken(parts[2], date.getDate());
  const weekMatches = matchDayOfWeek(parts[4], date.getDay());
  if (dayRestricted && weekRestricted) return dayMatches || weekMatches;
  if (dayRestricted) return dayMatches;
  if (weekRestricted) return weekMatches;
  return true;
}

function nextCronDate(expression: string, fromDate: Date): Date | null {
  if (!isSafeCronExpression(expression)) return null;
  const parts = expression.trim().split(/\s+/);
  const cursor = new Date(fromDate.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = cursor.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() <= limit) {
    if (cronMatches(cursor, parts)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

export function toLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
    return nextCronDate(job.cronExpression || '', fromDate);
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

  const slug = job.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'payload';
  const scriptPath = `/root/payloads/${slug}.sh`;
  const logPath = `/tmp/${slug}.log`;

  return `${cronExpr} ${scriptPath} >> ${logPath} 2>&1 # WIFIPINEAPPLE_JOB_${job.id}`;
}

/**
 * Generates script deployment commands for OpenWrt hardware
 */
export function generateHardwareDeployCommand(job: ScheduledPayloadJob): string | null {
  if (!isSafeJobId(job.id)) return null;
  const cronSource =
    job.triggerType === 'cron'
      ? job.cronExpression || ''
      : job.triggerType === 'interval'
        ? intervalToCronExpression(job.intervalMinutes || 15)
        : '';
  if (job.triggerType !== 'once' && !isSafeCronExpression(cronSource)) return null;
  if (job.triggerType === 'once') {
    const onceLine = generateOpenWrtCronLine(job).split(/\s+/).slice(0, 5).join(' ');
    if (!isSafeCronExpression(onceLine)) return null;
  }

  const slug = job.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'payload';
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
export function generateHardwareRemoveCommand(jobId: string): string | null {
  if (!isSafeJobId(jobId)) return null;
  return [
    `if [ -f /etc/crontabs/root ]; then`,
    `  grep -v "WIFIPINEAPPLE_JOB_${jobId}" /etc/crontabs/root > /tmp/crontab.tmp || true`,
    `  mv /tmp/crontab.tmp /etc/crontabs/root`,
    `  /etc/init.d/cron restart >/dev/null 2>&1 || true`,
    `fi`,
    `echo "[+] Job removed from /etc/crontabs/root"`,
  ].join('\n');
}
