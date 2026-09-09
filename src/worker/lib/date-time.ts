const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const parseDateKey = (value: string) => {
  if (!dateKeyPattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
};

export const addDateKey = (value: string, days: number) => {
  const parts = parseDateKey(value);
  if (!parts) throw new Error("Invalid date key");
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
};

const localParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second)
  };
};

const timezoneOffsetMilliseconds = (date: Date, timezone: string) => {
  const parts = localParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(date.getTime() / 1000) * 1000;
};

export const getLocalDate = (value: Date, timezone: string) => {
  const parts = localParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

export const getLocalTime = (value: Date, timezone: string) => {
  const parts = localParts(value, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
};

export const zonedDateTimeToDate = (dateKey: string, time: string, timezone: string): Date => {
  const parts = parseDateKey(dateKey);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!parts || !match) throw new Error("Invalid local date/time");
  const wallTime = Date.UTC(parts.year, parts.month - 1, parts.day, Number(match[1]), Number(match[2]));
  let instant = wallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = wallTime - timezoneOffsetMilliseconds(new Date(instant), timezone);
  }
  return new Date(instant);
};
