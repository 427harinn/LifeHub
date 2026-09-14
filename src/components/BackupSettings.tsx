import { useEffect, useRef, useState } from "react";
import { completeMigration, getMigrationStatus, restoreMigration, startMigration, verifyMigration, cancelMigration, type AuthUser } from "../api/client";
import { createFullBackup, downloadBackup, parseBackupFile } from "../lib/backup-client";
import type { LifeHubBackup } from "../lib/backup";
import { restoreArchiveBackup } from "../lib/archive-storage";
import { Button } from "./ui/Button";
import { BottomSheet } from "./ui/BottomSheet";

const preview = (backup: LifeHubBackup) => [
  ["予定", backup.manifest.countsByType["cloud.event"] ?? 0],
  ["お金", backup.manifest.countsByType["cloud.moneyItem"] ?? 0],
  ["日メモ", backup.manifest.countsByType["cloud.dailyNote"] ?? 0],
  ["アーカイブ", backup.manifest.archiveRecordCount]
] as Array<[string, number]>;

export function BackupSettings({ userId, onMigrationStarted }: { userId: string; onMigrationStarted: (migrationId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState(false); const [backupMessage, setBackupMessage] = useState(""); const [backupError, setBackupError] = useState("");
  const [migrationStep, setMigrationStep] = useState<"idle" | "exporting" | "awaiting-file" | "validated" | "starting">("idle"); const [migrationBackup, setMigrationBackup] = useState<LifeHubBackup | null>(null); const [migrationError, setMigrationError] = useState(""); const [confirmOpen, setConfirmOpen] = useState(false);
  const createNormalBackup = async () => { setBackupBusy(true); setBackupError(""); setBackupMessage(""); try { const result = await createFullBackup(userId); downloadBackup(result.serialized); setBackupMessage(`バックアップを作成しました（${Math.ceil(result.byteLength / 1024)}KB）。`); } catch (error) { setBackupError(error instanceof Error ? error.message : "バックアップを作成できませんでした。"); } finally { setBackupBusy(false); } };
  const startFlow = async () => { setMigrationStep("exporting"); setMigrationError(""); try { const result = await createFullBackup(userId); downloadBackup(result.serialized); setMigrationStep("awaiting-file"); } catch (error) { setMigrationStep("idle"); setMigrationError(error instanceof Error ? error.message : "バックアップを作成できませんでした。"); } };
  const selectFile = async (file: File | undefined) => { if (!file) return; setMigrationError(""); try { const result = await parseBackupFile(file, userId); setMigrationBackup(result.backup); setMigrationStep("validated"); } catch (error) { setMigrationBackup(null); setMigrationStep("awaiting-file"); setMigrationError(error instanceof Error ? error.message : "バックアップを確認できませんでした。"); } };
  const beginMigration = async () => { if (!migrationBackup) return; setMigrationStep("starting"); setMigrationError(""); try { const migrationId = crypto.randomUUID(); await startMigration({ migrationId, backup: migrationBackup, backupChecksum: migrationBackup.checksum, schemaVersion: migrationBackup.schemaVersion, manifest: migrationBackup.manifest }); onMigrationStarted(migrationId); } catch (error) { setMigrationStep("validated"); setMigrationError(error instanceof Error ? error.message : "機種変更を開始できませんでした。データは整理していません。"); } };
  return <>
    <section className="backup-settings" aria-label="バックアップ">
      <div className="settings-section-heading"><h2>バックアップ</h2><p>LifeHubのデータをJSONで保存します。</p></div>
      <Button disabled={backupBusy} onClick={() => { void createNormalBackup(); }}>{backupBusy ? "作成中…" : "バックアップを作成"}</Button>
      {backupMessage ? <p className="form-success" role="status">{backupMessage}</p> : null}{backupError ? <p className="form-error" role="alert">{backupError}</p> : null}
    </section>
    <section className="migration-settings" aria-label="機種変更">
      <div className="settings-section-heading"><h2>機種変更</h2><p>別の端末へすべてのデータを移します。</p></div>
      {migrationStep === "idle" ? <Button onClick={() => { void startFlow(); }}>機種変更を始める</Button> : null}
      {migrationStep === "exporting" ? <p className="empty-state">バックアップを作成中…</p> : null}
      {migrationStep === "awaiting-file" ? <><p className="empty-state">保存したJSONを選択してください。</p><Button onClick={() => inputRef.current?.click()} variant="secondary">保存したファイルを選択</Button></> : null}
      {migrationBackup && migrationStep === "validated" ? <><p className="form-success" role="status">バックアップを確認しました。</p><div className="backup-preview">{preview(migrationBackup).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString("ja-JP")}件</strong></div>)}<div><span>対象期間</span><strong>{migrationBackup.manifest.minDate ?? "—"}〜{migrationBackup.manifest.maxDate ?? "—"}</strong></div></div><Button onClick={() => setConfirmOpen(true)}>このバックアップで機種変更を開始</Button><Button onClick={() => inputRef.current?.click()} variant="secondary">別のファイルを選択</Button></> : null}
      {migrationStep === "starting" ? <p className="empty-state">機種変更を開始中…</p> : null}
      {migrationError ? <p className="form-error" role="alert">{migrationError}</p> : null}
      <p className="backup-note">復元が完了するまでJSONを失わないでください。ほかの人と共有しないでください。</p>
    </section>
    <input ref={inputRef} accept="application/json,.json" className="backup-file-input" onChange={(event) => { void selectFile(event.target.files?.[0]); }} type="file" />
    <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="機種変更を開始しますか？"><div className="migration-confirm"><p>この端末では通常操作が一時停止します。新端末でこのJSONを読み込み、復元が完了するまで編集できません。</p><p>バックアップファイルを安全な場所に保存していることを確認してください。</p><Button onClick={() => { setConfirmOpen(false); void beginMigration(); }}>開始する</Button><Button onClick={() => setConfirmOpen(false)} variant="ghost">戻る</Button></div></BottomSheet>
  </>;
}

export function MigrationScreen({ user, migrationId, onCompleted }: { user: AuthUser; migrationId?: string; onCompleted: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null); const [migration, setMigration] = useState<{ migrationId: string; status: string; backupChecksum: string } | null>(null); const [backup, setBackup] = useState<LifeHubBackup | null>(null); const [status, setStatus] = useState<"loading" | "ready" | "restoring" | "complete" | "error">("loading"); const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void getMigrationStatus().then((result) => { if (!active) return; const next = result.migration ?? (migrationId ? { migrationId, status: "awaiting_restore", backupChecksum: "" } : null); setMigration(next); setStatus(next ? "ready" : "error"); }).catch(() => { if (active) { setStatus("error"); setMessage("機種変更の状態を確認できませんでした。"); } }); return () => { active = false; }; }, [migrationId]);
  const selectFile = async (file: File | undefined) => { if (!file) return; try { const result = await parseBackupFile(file, user.id); if (migration?.backupChecksum && result.backup.checksum !== migration.backupChecksum) throw new Error("機種変更開始時のバックアップと一致しません。"); setBackup(result.backup); setMessage("バックアップを確認しました。復元できます。"); } catch (error) { setBackup(null); setMessage(error instanceof Error ? error.message : "バックアップを確認できませんでした。"); } };
  const restore = async () => { if (!backup || !migration) return; setStatus("restoring"); setMessage("サーバーのデータを復元しています…"); try { await restoreMigration(migration.migrationId, backup); setMessage("端末のアーカイブを復元しています…"); const rows = await restoreArchiveBackup(user.id, backup.archive); if (rows.length !== backup.manifest.archiveRecordCount) throw new Error("アーカイブ件数を確認できませんでした。"); setMessage("復元内容を確認しています…"); await verifyMigration(migration.migrationId, backup.checksum, rows.length); await completeMigration(migration.migrationId); setStatus("complete"); setMessage("復元が完了しました。"); onCompleted(); } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "復元に失敗しました。lockは維持されています。再試行してください。"); } };
  const cancel = async () => { if (!migration) return; try { await cancelMigration(migration.migrationId); setMessage("機種変更をキャンセルしました。"); } catch (error) { setMessage(error instanceof Error ? error.message : "データ整理後は復旧用バックアップからの復元が必要です。"); } };
  if (status === "loading") return <main className="screen-page migration-page"><h1>機種変更中</h1><p className="empty-state">状態を確認中…</p></main>;
  return <main className="screen-page migration-page"><header className="screen-header"><h1>機種変更中</h1><span className="header-spacer" /></header><section className="migration-flow"><p>バックアップJSONを読み込んでデータを復元してください。</p><ol><li>バックアップを選択</li><li>復元内容を確認</li><li>復元完了後に通常利用へ戻る</li></ol><input ref={inputRef} accept="application/json,.json" className="backup-file-input" onChange={(event) => { void selectFile(event.target.files?.[0]); }} type="file" /><Button disabled={status === "restoring" || status === "complete"} onClick={() => inputRef.current?.click()} variant="secondary">バックアップを選択</Button>{backup ? <div className="backup-preview">{preview(backup).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString("ja-JP")}件</strong></div>)}</div> : null}{message ? <p className={status === "error" ? "form-error" : "form-success"} role="status">{message}</p> : null}{backup && status !== "complete" ? <Button disabled={status === "restoring"} onClick={() => { void restore(); }}>{status === "restoring" ? "復元中…" : "このバックアップを復元"}</Button> : null}{status !== "complete" ? <Button disabled={status === "restoring"} onClick={() => { void cancel(); }} variant="ghost">機種変更をキャンセル</Button> : null}</section></main>;
}
