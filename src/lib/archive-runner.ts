import type { ArchiveCandidateResponse } from "./archive";

export type ArchiveRunnerResult = { confirmed: boolean; alreadyConfirmed?: boolean };
export type ArchiveRunnerDependencies = {
  saveAndVerify: (candidate: ArchiveCandidateResponse) => Promise<unknown>;
  markConfirmPending: (candidate: ArchiveCandidateResponse) => Promise<void>;
  confirm: (candidate: ArchiveCandidateResponse) => Promise<ArchiveRunnerResult>;
};

/** Enforces the only safe order: local save/read-back, metadata state, then server confirm. */
export const runArchiveBatch = async (candidate: ArchiveCandidateResponse, dependencies: ArchiveRunnerDependencies) => {
  await dependencies.saveAndVerify(candidate);
  await dependencies.markConfirmPending(candidate);
  return dependencies.confirm(candidate);
};
