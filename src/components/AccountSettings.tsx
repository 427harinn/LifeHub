import { useState, type FormEvent } from "react";
import { changePassword, type AuthUser } from "../api/client";
import { Button, FormRow, Input } from "./ui";

const PASSWORD_MIN_LENGTH = 12;

export function AccountSettings({ user, onLogout, onChangePassword, successMessage }: { user: AuthUser; onLogout: () => void; onChangePassword: () => void; successMessage?: string }) {
  return <section className="account-settings">
    <FormRow label="メール" summary={user.email} />
    <FormRow ariaLabel="パスワードを変更" label="パスワード" onClick={onChangePassword} summary="パスワードを変更" />
    {successMessage ? <p className="form-success" role="status">{successMessage}</p> : null}
    <Button onClick={onLogout} variant="secondary">ログアウト</Button>
  </section>;
}

type PasswordChangeFormProps = { onCompleted?: () => void };

export function PasswordChangeSettings({ onCompleted }: PasswordChangeFormProps) {
  return <section className="password-change-settings"><PasswordChangeForm onCompleted={onCompleted} /></section>;
}

function PasswordChangeForm({ onCompleted }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < PASSWORD_MIN_LENGTH) { setError(`パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`); return; }
    if (newPassword !== confirmation) { setError("新しいパスワードが一致しません。"); return; }
    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmation });
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      setSuccess("パスワードを変更しました。");
      onCompleted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "パスワードを変更できませんでした。");
    } finally { setBusy(false); }
  };

  return <form className="settings-password-form" onSubmit={(event) => { void submit(event); }}>
    <label className="input-field" htmlFor="current-password"><span>現在のパスワード</span><Input autoComplete="current-password" id="current-password" onChange={setCurrentPassword} required type="password" value={currentPassword} /></label>
    <label className="input-field" htmlFor="new-password"><span>新しいパスワード</span><Input autoComplete="new-password" id="new-password" minLength={PASSWORD_MIN_LENGTH} onChange={setNewPassword} required type="password" value={newPassword} /></label>
    <label className="input-field" htmlFor="new-password-confirmation"><span>新しいパスワード（確認）</span><Input autoComplete="new-password" id="new-password-confirmation" minLength={PASSWORD_MIN_LENGTH} onChange={setConfirmation} required type="password" value={confirmation} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {success ? <p className="form-success" role="status">{success}</p> : null}
    <Button disabled={busy} type="submit">{busy ? "変更中…" : "パスワードを変更"}</Button>
  </form>;
}
