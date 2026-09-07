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
