import { forbiddenError } from "../lib/errors";
import { UserStateRepository } from "../repositories/user-state-repository";
import type { RequestContext } from "./auth";

export const assertMigrationWritable = (migrationState: "active" | "migration_locked") => {
  if (migrationState === "migration_locked") throw forbiddenError("機種変更中のため、通常の変更はできません。");
};

export const requireWritableUserState = async (context: RequestContext & { user: { id: string } }) => {
  const state = await new UserStateRepository(context.env.DB).getOrCreate(context.user.id, new Date().toISOString());
  assertMigrationWritable(state.migrationState);
  return state;
};
