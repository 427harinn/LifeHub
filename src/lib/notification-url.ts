export const fallbackNotificationUrl = "/calendar";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const eventNotificationUrl = (eventId: string, date: string, occurrenceKey?: string | null) => {
  if (!eventId || !datePattern.test(date)) return fallbackNotificationUrl;
  const params = new URLSearchParams({ date, event: eventId });
  if (occurrenceKey) params.set("occurrenceKey", occurrenceKey);
  return `/calendar?${params.toString()}`;
};
export const summaryNotificationUrl = (date: string) => datePattern.test(date) ? `/calendar?date=${encodeURIComponent(date)}` : fallbackNotificationUrl;
export const resolveNotificationUrl = (value: unknown, origin = "https://lifehub.invalid") => {
  if (typeof value !== "string" || !value || value.startsWith("//")) return fallbackNotificationUrl;
  try { decodeURI(value); const url = new URL(value, origin); if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return fallbackNotificationUrl; return `${url.pathname}${url.search}${url.hash}`; }
  catch { return fallbackNotificationUrl; }
};
