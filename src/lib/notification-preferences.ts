export type NotificationPreferenceMode = "template" | "custom" | "none";
export type LastUsedNotificationPreference = { mode: NotificationPreferenceMode; templateId: string | null; offsets: number[] };

export const emptyNotificationPreference = (): LastUsedNotificationPreference => ({ mode: "none", templateId: null, offsets: [] });

const validOffsets = (value: unknown): value is number[] => Array.isArray(value) && value.every((offset) => Number.isInteger(offset) && offset >= 0 && offset <= 525600);

export const normalizeNotificationPreference = (value: unknown): LastUsedNotificationPreference | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { mode?: unknown; templateId?: unknown; offsets?: unknown };
  if (candidate.mode !== "template" && candidate.mode !== "custom" && candidate.mode !== "none") return null;
  if (!validOffsets(candidate.offsets)) return null;
  const offsets = [...new Set(candidate.offsets)];
  if (candidate.mode === "none") return emptyNotificationPreference();
  if (offsets.length === 0) return emptyNotificationPreference();
  if (candidate.mode === "template" && typeof candidate.templateId !== "string") return null;
  return { mode: candidate.mode, templateId: candidate.mode === "template" ? candidate.templateId as string : null, offsets };
};

export const notificationPreferenceFromStorage = (value: string | null | undefined): LastUsedNotificationPreference => {
  if (!value) return emptyNotificationPreference();
  try { return normalizeNotificationPreference(JSON.parse(value)) ?? emptyNotificationPreference(); } catch { return emptyNotificationPreference(); }
};

export const notificationPreferenceToStorage = (value: LastUsedNotificationPreference): string => JSON.stringify(normalizeNotificationPreference(value) ?? emptyNotificationPreference());
