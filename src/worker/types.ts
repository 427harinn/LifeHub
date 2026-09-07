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

export type Event = {
  id: string;
  userId: string;
  category: EventCategory;
  title: string;
  place: string | null;
  memo: string | null;
  timingType: EventTimingType;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledEventInput = Pick<Event, "category" | "title" | "place" | "memo" | "timingType" | "allDay" | "startDate" | "startTime" | "endDate" | "endTime">;
