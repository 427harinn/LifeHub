export type ErrorCode = "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" | "INTERNAL_ERROR" | "PUSH_CONFIG_UNAVAILABLE" | "ARCHIVE_BATCH_NOT_FOUND" | "ARCHIVE_SCHEMA_MISMATCH" | "ARCHIVE_CONFIRM_MISMATCH" | "ARCHIVE_STALE" | "MIGRATION_PAYLOAD_TOO_LARGE" | "MIGRATION_INPUT_INVALID" | "MIGRATION_MANIFEST_INVALID" | "MIGRATION_ID_REUSED" | "MIGRATION_ALREADY_LOCKED" | "MIGRATION_NOT_FOUND" | "MIGRATION_RESTORE_NOT_ALLOWED" | "MIGRATION_CHECKSUM_MISMATCH" | "MIGRATION_VERIFY_NOT_ALLOWED" | "MIGRATION_VERIFY_INPUT_INVALID" | "MIGRATION_VERIFY_FAILED" | "MIGRATION_ARCHIVE_VERIFY_FAILED" | "MIGRATION_COMPLETE_NOT_ALLOWED" | "MIGRATION_RECOVERY_REQUIRED";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const validationError = (details: Record<string, string>, message = "入力内容を確認してください。") =>
  new AppError("VALIDATION_ERROR", 400, message, details);
export const unauthenticatedError = () => new AppError("UNAUTHENTICATED", 401, "認証が必要です。");
export const forbiddenError = (message = "この操作は許可されていません。") => new AppError("FORBIDDEN", 403, message);
export const conflictError = (message = "すでに登録されています。") => new AppError("CONFLICT", 409, message);
export const notFoundError = () => new AppError("NOT_FOUND", 404, "対象が見つかりません。");
