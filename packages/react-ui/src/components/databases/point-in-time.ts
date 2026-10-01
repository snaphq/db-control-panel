const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Turns the value of a `datetime-local` input, which is the wall-clock time in
 * the browser's own zone, into the UTC instant the control plane expects
 * (`parent_timestamp`). Null when the value is empty or not a real time.
 */
export function localInputToUtc(value: string): string | null {
  if (!LOCAL_INPUT.test(value)) return null;
  // A date-time without an offset is read as local time (ECMAScript Date Time String Format).
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Date rolls 02-31 over to 03-03 and 24:00 to the next day; a value that does
  // not read back the same is not a real local time.
  return toLocalInputValue(date) === value.slice(0, 16)
    ? date.toISOString()
    : null;
}

/** The `datetime-local` value (local wall-clock, minute precision) of an instant. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type PointInTimeCheck =
  | { ok: true; utc: string }
  | { ok: false; reason: string | null };

/**
 * Checks a `datetime-local` value against what the control plane will accept:
 * a time that has passed and is within the project's history retention. A
 * `reason` of null means nothing has been entered yet.
 */
export function checkPointInTime(
  value: string,
  retentionSeconds: number,
  now: Date = new Date(),
): PointInTimeCheck {
  if (value === "") return { ok: false, reason: null };
  const utc = localInputToUtc(value);
  if (!utc) return { ok: false, reason: "Enter a valid date and time." };
  const at = new Date(utc).getTime();
  if (at > now.getTime()) {
    return { ok: false, reason: "That time has not happened yet." };
  }
  if (at < now.getTime() - retentionSeconds * 1000) {
    return {
      ok: false,
      reason: `History is kept for ${formatRetention(retentionSeconds)}; pick a more recent time.`,
    };
  }
  return { ok: true, utc };
}

function formatRetention(seconds: number): string {
  if (seconds % 86_400 === 0 && seconds >= 86_400) {
    const days = seconds / 86_400;
    return days === 1 ? "1 day" : `${days} days`;
  }
  const hours = Math.round(seconds / 3600);
  if (hours >= 1) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
