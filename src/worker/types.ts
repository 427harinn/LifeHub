import type { LastUsedNotificationPreference } from "../lib/notification-preferences";

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};

export type UserSettings = {
  userId: string;
  timezone: string;
  weekStartsOn: number;
  morningSummaryEnabled: boolean;
  morningSummaryTime: string;
  eveningSummaryEnabled: boolean;
  eveningSummaryTime: string;
  periodDefaultDeadlineTime: string;
  lastUsedNotificationHome: LastUsedNotificationPreference;
  lastUsedNotificationWork: LastUsedNotificationPreference;
  createdAt: string;
  updatedAt: string;
};

export type LifeHubUserState = {
  userId: string;
  migrationState: "active" | "migration_locked";
  migrationStartedAt: string | null;
  migrationBackupChecksum: string | null;
  migrationBackupCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventCategory = "home" | "work";
export type EventTimingType = "scheduled" | "period";
export type PeriodWindowType = "this_week" | "this_month" | "custom_range";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export type RecurrenceRule = {
  id: string;
  userId: string;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[] | null;
  dayOfMonth: number | null;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecurrenceRuleInput = Pick<RecurrenceRule, "frequency" | "interval" | "weekdays" | "dayOfMonth" | "startsOn" | "endsOn">;

export type Event = {
  id: string;
  userId: string;
  category: EventCategory;
  title: string;
  place: string | null;
  memo: string | null;
  timingType: EventTimingType;
  allDay: boolean | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  periodWindowType: PeriodWindowType | null;
  periodAnchorDate: string | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  deadlineTime: string | null;
  recurrenceRuleId: string | null;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present when this Event is a projected recurrence occurrence. */
  occurrenceKey?: string | null;
  recurrence?: RecurrenceRule | null;
  notifications?: number[];
};

export type EventNotification = {
  id: string;
  userId: string;
  eventId: string;
  offsetMinutes: number;
  sortOrder: number;
  createdAt: string;
};

export type NotificationJob = {
  id: string;
  userId: string;
  eventId: string;
  occurrenceKey: string | null;
  eventNotificationId: string;
  scheduledFor: string;
  payload: { title: string; body: string; data: { kind: "event"; eventId: string; date: string; occurrenceKey: string | null; url: string } };
  status: "pending" | "sent";
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDelivery = {
  id: string;
  userId: string;
  notificationType: "event" | "morning_summary" | "evening_summary";
  eventId: string | null;
  occurrenceKey: string | null;
  eventNotificationId: string | null;
  scheduledFor: string;
  dedupeKey: string;
  sentAt: string | null;
  status: "pending" | "sent" | "failed";
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationTemplateOffset = {
  id: string;
  templateId: string;
  offsetMinutes: number;
  sortOrder: number;
};

export type NotificationTemplate = {
  id: string;
  userId: string;
  name: string;
  targetCategory: EventCategory | null;
  isDefault: boolean;
  active: boolean;
  offsets: NotificationTemplateOffset[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduledEventInput = Pick<Event, "category" | "title" | "place" | "memo" | "timingType" | "allDay" | "startDate" | "startTime" | "endDate" | "endTime" | "periodWindowType" | "periodAnchorDate" | "periodStartDate" | "periodEndDate" | "deadlineTime">;
export type PeriodEventInput = ScheduledEventInput & Pick<Event, "periodWindowType" | "periodAnchorDate" | "periodStartDate" | "periodEndDate" | "deadlineTime">;
export type EventInput = ScheduledEventInput & Partial<Pick<Event, "periodWindowType" | "periodAnchorDate" | "periodStartDate" | "periodEndDate" | "deadlineTime">>;

export type EventOccurrenceOverrideType = "modified" | "cancelled";
export type EventOccurrenceOverride = {
  id: string;
  userId: string;
  eventId: string;
  occurrenceKey: string;
  overrideType: EventOccurrenceOverrideType;
  patch: Partial<EventInput> | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyNote = {
  id: string;
  userId: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type MoneyType = "expense" | "income";

export type MoneyCategory = {
  id: string;
  userId: string;
  type: MoneyType;
  name: string;
  colorKey: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MoneyItem = {
  id: string;
  userId: string;
  type: MoneyType;
  title: string;
  categoryId: string;
  plannedAmount: number;
  date: string;
  time: string | null;
  recurrenceRuleId: string | null;
  memo: string | null;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present when a MoneyItem is returned with its series rule or as a projection. */
  recurrence?: RecurrenceRule | null;
  occurrenceKey?: string | null;
  definitionDate?: string;
};

export type MoneyItemInput = Pick<MoneyItem, "type" | "title" | "categoryId" | "plannedAmount" | "date" | "memo">;
export type MoneyOccurrenceOverrideType = "modified" | "cancelled";
export type MoneyOccurrenceOverride = {
  id: string;
  userId: string;
  moneyItemId: string;
  occurrenceKey: string;
  overrideType: MoneyOccurrenceOverrideType;
  patch: Partial<MoneyItemInput> | null;
  createdAt: string;
  updatedAt: string;
};
export type MoneySettlementStatus = "actual" | "estimated_actual";
export type MoneyOccurrenceSettlement = {
  id: string;
  userId: string;
  moneyItemId: string;
  occurrenceKey: string;
  status: MoneySettlementStatus;
  amount: number;
  finalizedAt: string;
  updatedAt: string;
  estimatedAmount: number | null;
};
