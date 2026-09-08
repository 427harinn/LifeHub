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
