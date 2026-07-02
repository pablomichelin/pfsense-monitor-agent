export const BACKUP_SCHEDULE_MODES = [
  'hours',
  'daily',
  'weekly',
  'monthly',
] as const;

export type BackupScheduleMode = (typeof BACKUP_SCHEDULE_MODES)[number];

export type BackupSchedulePolicy = {
  enabled: boolean;
  schedule_mode: BackupScheduleMode;
  interval_hours: number;
  schedule_time: string;
  schedule_dow: number;
  schedule_dom: number;
};

export const BACKUP_LATE_FALLBACK_HOURS = 36;
export const BACKUP_LATE_GRACE_MS = 6 * 60 * 60 * 1000;

const MS_PER_HOUR = 60 * 60 * 1000;

const clampDom = (year: number, monthIndex: number, dom: number): number => {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(Math.max(1, dom), daysInMonth);
};

const parseScheduleTime = (
  value: string | undefined,
): { hour: number; minute: number } | null => {
  const match = /^(\d{2}):(\d{2})$/.exec((value ?? '03:00').trim());
  if (!match) {
    return null;
  }

  return {
    hour: Number.parseInt(match[1], 10),
    minute: Number.parseInt(match[2], 10),
  };
};

const zonedParts = (
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number.parseInt(
      parts.find((part) => part.type === type)?.value ?? '0',
      10,
    );

  const weekdayLabel =
    parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    weekday: weekdayMap[weekdayLabel] ?? 0,
  };
};

const zonedDateTimeToUtc = (
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
): Date => {
  let guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedParts(new Date(guess), timeZone);
    const desiredAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0,
    );
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const diffMs = desiredAsUtc - observedAsUtc;
    guess += diffMs;
    if (Math.abs(diffMs) < 1000) {
      break;
    }
  }

  return new Date(guess);
};

export function computeNextScheduledBackupAt(
  lastBackupAt: Date,
  policy: BackupSchedulePolicy,
  timeZone = 'UTC',
): Date | null {
  const mode = policy.schedule_mode;
  const intervalHours = Math.max(1, policy.interval_hours);

  if (mode === 'hours') {
    return new Date(lastBackupAt.getTime() + intervalHours * MS_PER_HOUR);
  }

  const scheduleTime = parseScheduleTime(policy.schedule_time);
  if (!scheduleTime) {
    return new Date(lastBackupAt.getTime() + intervalHours * MS_PER_HOUR);
  }

  const cursor = new Date(lastBackupAt.getTime() + 60_000);
  const cursorParts = zonedParts(cursor, timeZone);

  if (mode === 'daily') {
    let candidate = zonedDateTimeToUtc(
      {
        year: cursorParts.year,
        month: cursorParts.month,
        day: cursorParts.day,
        hour: scheduleTime.hour,
        minute: scheduleTime.minute,
        second: 0,
      },
      timeZone,
    );
    if (candidate.getTime() <= cursor.getTime()) {
      const nextDay = new Date(
        Date.UTC(cursorParts.year, cursorParts.month - 1, cursorParts.day + 1),
      );
      const nextParts = zonedParts(nextDay, timeZone);
      candidate = zonedDateTimeToUtc(
        {
          year: nextParts.year,
          month: nextParts.month,
          day: nextParts.day,
          hour: scheduleTime.hour,
          minute: scheduleTime.minute,
          second: 0,
        },
        timeZone,
      );
    }
    return candidate;
  }

  if (mode === 'weekly') {
    const targetDow = Math.min(6, Math.max(0, policy.schedule_dow));
    let delta = (targetDow - cursorParts.weekday + 7) % 7;
    if (delta === 0) {
      const sameDayCandidate = zonedDateTimeToUtc(
        {
          year: cursorParts.year,
          month: cursorParts.month,
          day: cursorParts.day,
          hour: scheduleTime.hour,
          minute: scheduleTime.minute,
          second: 0,
        },
        timeZone,
      );
      if (sameDayCandidate.getTime() <= cursor.getTime()) {
        delta = 7;
      } else {
        return sameDayCandidate;
      }
    }

    const targetDay = new Date(
      Date.UTC(cursorParts.year, cursorParts.month - 1, cursorParts.day + delta),
    );
    const targetParts = zonedParts(targetDay, timeZone);
    return zonedDateTimeToUtc(
      {
        year: targetParts.year,
        month: targetParts.month,
        day: targetParts.day,
        hour: scheduleTime.hour,
        minute: scheduleTime.minute,
        second: 0,
      },
      timeZone,
    );
  }

  if (mode === 'monthly') {
    const dom = clampDom(
      cursorParts.year,
      cursorParts.month - 1,
      policy.schedule_dom,
    );
    let candidate = zonedDateTimeToUtc(
      {
        year: cursorParts.year,
        month: cursorParts.month,
        day: dom,
        hour: scheduleTime.hour,
        minute: scheduleTime.minute,
        second: 0,
      },
      timeZone,
    );
    if (candidate.getTime() <= cursor.getTime()) {
      const nextMonth = new Date(
        Date.UTC(cursorParts.year, cursorParts.month, 1),
      );
      const nextParts = zonedParts(nextMonth, timeZone);
      const nextDom = clampDom(
        nextParts.year,
        nextParts.month - 1,
        policy.schedule_dom,
      );
      candidate = zonedDateTimeToUtc(
        {
          year: nextParts.year,
          month: nextParts.month,
          day: nextDom,
          hour: scheduleTime.hour,
          minute: scheduleTime.minute,
          second: 0,
        },
        timeZone,
      );
    }
    return candidate;
  }

  return new Date(lastBackupAt.getTime() + intervalHours * MS_PER_HOUR);
}

export function isBackupLateBySchedule(
  lastBackupAt: Date,
  policy: BackupSchedulePolicy | null | undefined,
  now: Date,
  timeZone = 'UTC',
): boolean {
  if (!policy?.enabled) {
    return false;
  }

  if (!policy.schedule_mode) {
    const ageHours = (now.getTime() - lastBackupAt.getTime()) / MS_PER_HOUR;
    return ageHours > BACKUP_LATE_FALLBACK_HOURS;
  }

  const nextDueAt = computeNextScheduledBackupAt(lastBackupAt, policy, timeZone);
  if (!nextDueAt) {
    const ageHours = (now.getTime() - lastBackupAt.getTime()) / MS_PER_HOUR;
    return ageHours > BACKUP_LATE_FALLBACK_HOURS;
  }

  return now.getTime() > nextDueAt.getTime() + BACKUP_LATE_GRACE_MS;
}
