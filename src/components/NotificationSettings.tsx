import { useEffect, useState } from "react";
import { createNotificationTemplate, deleteNotificationTemplate, getNotificationTemplates, getVapidPublicKey, registerPushSubscription, unregisterPushSubscription, updateNotificationTemplate } from "../api/notifications";
import { updateSettings } from "../api/client";
import type { NotificationTemplate, UserSettings } from "../worker/types";
import { BottomSheet, Button, FormRow, Input } from "./ui";
import { getBrowserCapabilities } from "../lib/capabilities";
import { urlBase64ToUint8Array } from "../lib/vapid";
import { notificationOffsetLabel, notificationSummary } from "../lib/notification-labels";
import { getLifeHubServiceWorkerRegistration } from "../lib/service-worker";

const presetOffsets = [10, 30, 60, 1440];
export function NotificationOffsetPicker({ offsets, onChange }: { offsets: number[]; onChange: (next: number[]) => void }) {
  const toggle = (offset: number) => onChange(offsets.includes(offset) ? offsets.filter((value) => value !== offset) : [...offsets, offset].sort((left, right) => right - left));
  return <div className="notification-offset-picker">{presetOffsets.map((offset) => <label key={offset} className="notification-offset-option"><input checked={offsets.includes(offset)} onChange={() => toggle(offset)} type="checkbox" /><span>{notificationOffsetLabel(offset)}</span></label>)}</div>;
}

function TimeSheet({ open, title, value, onClose, onSave }: { open: boolean; title: string; value: string; onClose: () => void; onSave: (value: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  return <BottomSheet open={open} title={title} onClose={onClose}><div className="notification-time-sheet"><label className="input-field" htmlFor="notification-time"><span>時刻</span><Input id="notification-time" onChange={setDraft} type="time" value={draft} /></label><Button disabled={busy} onClick={() => { setBusy(true); void onSave(draft).finally(() => setBusy(false)); }}>{busy ? "保存中…" : "この時刻にする"}</Button></div></BottomSheet>;
}

export function TemplateManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [offsets, setOffsets] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(""); try { const result = await getNotificationTemplates(); setTemplates(result.templates ?? []); } catch { setError("テンプレートを読み込めませんでした。"); } finally { setLoading(false); } };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) void load(); }, [open]);
  const startCreate = () => { setEditing(null); setCreating(true); setName(""); setOffsets([1440, 30]); setError(""); };
  const startEdit = (template: NotificationTemplate) => { setEditing(template); setCreating(false); setName(template.name); setOffsets(template.offsets.map((offset) => offset.offsetMinutes)); setError(""); };
  const save = async () => { if (busy) return; if (!name.trim()) { setError("テンプレート名を入力してください。"); return; } setBusy(true); setError(""); try { if (editing) await updateNotificationTemplate(editing.id, { name: name.trim(), offsets }); else await createNotificationTemplate({ name: name.trim(), offsets, isDefault: templates.length === 0 }); await load(); setEditing(null); setCreating(false); } catch { setError("テンプレートを保存できませんでした。"); } finally { setBusy(false); } };
  const remove = async () => { if (!editing || busy) return; setBusy(true); setError(""); try { await deleteNotificationTemplate(editing.id); await load(); setEditing(null); setCreating(false); } catch { setError("テンプレートを削除できませんでした。"); } finally { setBusy(false); } };
  return <BottomSheet open={open} title="通知テンプレート" onClose={onClose}>{editing || creating ? <div className="template-editor"><label className="input-field" htmlFor="template-name"><span>名前</span><Input disabled={busy} id="template-name" onChange={setName} value={name} /></label><NotificationOffsetPicker offsets={offsets} onChange={setOffsets} /><p className="notification-summary-preview">{notificationSummary(offsets)}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} onClick={() => { void save(); }}>{busy ? "保存中…" : editing ? "変更を保存" : "作成"}</Button>{editing ? <Button disabled={busy} onClick={() => { void remove(); }} variant="secondary">{busy ? "処理中…" : "削除"}</Button> : null}<Button disabled={busy} onClick={() => { setEditing(null); setCreating(false); }} variant="ghost">戻る</Button></div> : <div className="template-list">{loading ? <p className="empty-state" role="status">読み込み中…</p> : <div className="template-list__rows">{templates.map((template) => <FormRow key={template.id} label={template.name} onClick={() => startEdit(template)} summary={notificationSummary(template.offsets.map((offset) => offset.offsetMinutes))} />)}{templates.length === 0 ? <p className="empty-state">テンプレートはありません</p> : null}</div>}<Button disabled={loading || busy} onClick={startCreate}>テンプレートを追加</Button>{error ? <><p className="form-error" role="alert">{error}</p><Button disabled={busy} onClick={() => { void load(); }} variant="secondary">テンプレートを再試行</Button></> : null}</div>}</BottomSheet>;
}

async function ensurePushSubscription() {
  const capabilities = getBrowserCapabilities();
  if (!capabilities.serviceWorkerSupported || !capabilities.pushManagerSupported || !capabilities.notificationSupported) throw new Error("この端末では通知を利用できません。");
  if (capabilities.homeScreenInstallRequired) throw new Error("iPhoneではLifeHubをホーム画面に追加したPWAで通知を有効にしてください。");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("通知の許可が必要です。");
  const registration = await getLifeHubServiceWorkerRegistration();
  const current = await registration.pushManager.getSubscription();
  const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array((await getVapidPublicKey()).publicKey).buffer as ArrayBuffer });
  await registerPushSubscription(subscription);
}

function NotificationToggleRow({ label, pressed, ariaLabel, disabled, onClick }: { label: string; pressed: boolean; ariaLabel: string; disabled: boolean; onClick: () => void }) {
  return <button aria-label={ariaLabel} aria-pressed={pressed} className="notification-toggle-row" disabled={disabled} onClick={onClick} type="button"><span>{label}</span><span className="notification-toggle-row__value">{pressed ? "ON" : "OFF"}</span><span aria-hidden="true" className={`notification-switch${pressed ? " is-on" : ""}`}><span /></span></button>;
}

export function NotificationSettingsSection({ settings, onSettingsChange }: { settings: UserSettings | null; onSettingsChange: (settings: UserSettings) => void }) {
  const defaults = settings ?? { userId: "", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "", updatedAt: "" };
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [error, setError] = useState("");
  const [timeTarget, setTimeTarget] = useState<"morning" | "evening" | "deadline" | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  useEffect(() => { let active = true; const load = async () => { try { const capabilities = getBrowserCapabilities(); if (!capabilities.notificationSupported || capabilities.notificationPermission !== "granted" || !capabilities.serviceWorkerSupported) { if (active) setDeviceOn(false); return; } const registration = await navigator.serviceWorker.getRegistration("/"); const subscription = await registration?.pushManager.getSubscription(); if (active) setDeviceOn(Boolean(subscription)); } catch { if (active) { setDeviceOn(false); setError("この端末の通知状態を確認できませんでした。"); } } }; void load(); return () => { active = false; }; }, []);
  const patchSettings = async (patch: Partial<UserSettings>) => { if (settingsBusy) return false; setSettingsBusy(true); setError(""); try { const result = await updateSettings(patch); onSettingsChange(result.settings); return true; } catch { setError("通知設定を保存できませんでした。"); return false; } finally { setSettingsBusy(false); } };
  const toggleDevice = async () => { setBusy(true); setError(""); try { if (deviceOn) { const registration = await navigator.serviceWorker.getRegistration("/"); const subscription = await registration?.pushManager.getSubscription(); if (subscription) { await subscription.unsubscribe(); await unregisterPushSubscription(subscription.endpoint); } setDeviceOn(false); } else { await ensurePushSubscription(); setDeviceOn(true); } } catch (caught) { setError(caught instanceof Error ? caught.message : "通知を変更できませんでした。"); } finally { setBusy(false); } };
  const timeTitle = timeTarget === "morning" ? "朝のまとめ通知" : timeTarget === "evening" ? "夜のまとめ通知" : "期間予定の期限時刻";
  const timeValue = timeTarget === "morning" ? defaults.morningSummaryTime : timeTarget === "evening" ? defaults.eveningSummaryTime : defaults.periodDefaultDeadlineTime;
  const saveTime = async (value: string) => { if (!timeTarget) return; if (await patchSettings(timeTarget === "morning" ? { morningSummaryTime: value } : timeTarget === "evening" ? { eveningSummaryTime: value } : { periodDefaultDeadlineTime: value })) setTimeTarget(null); };
  return <section className="notification-settings">
    <section className="notification-settings-section">
      <h2>この端末の通知</h2>
      <NotificationToggleRow ariaLabel="この端末の通知を変更" disabled={busy || deviceOn === null} label="この端末の通知" onClick={() => { void toggleDevice(); }} pressed={deviceOn === true} />
      <p className="notification-settings-hint">通知を受け取るための端末設定</p>
    </section>
    <section className="notification-settings-section">
      <h2>朝のまとめ通知</h2>
      <NotificationToggleRow ariaLabel="朝のまとめ通知を切り替え" disabled={settingsBusy} label="朝のまとめ通知" onClick={() => { void patchSettings({ morningSummaryEnabled: !defaults.morningSummaryEnabled }); }} pressed={defaults.morningSummaryEnabled} />
      {defaults.morningSummaryEnabled ? <FormRow ariaLabel="朝のまとめ通知時刻を変更" disabled={settingsBusy} label="通知時刻" onClick={() => setTimeTarget("morning")} summary={defaults.morningSummaryTime} /> : null}
    </section>
    <section className="notification-settings-section">
      <h2>夜のまとめ通知</h2>
      <NotificationToggleRow ariaLabel="夜のまとめ通知を切り替え" disabled={settingsBusy} label="夜のまとめ通知" onClick={() => { void patchSettings({ eveningSummaryEnabled: !defaults.eveningSummaryEnabled }); }} pressed={defaults.eveningSummaryEnabled} />
      {defaults.eveningSummaryEnabled ? <FormRow ariaLabel="夜のまとめ通知時刻を変更" disabled={settingsBusy} label="通知時刻" onClick={() => setTimeTarget("evening")} summary={defaults.eveningSummaryTime} /> : null}
    </section>
    <section className="notification-settings-section">
      <h2>通知テンプレート</h2>
      <FormRow ariaLabel="通知テンプレートを管理" disabled={settingsBusy} label="通知テンプレートを管理" onClick={() => setTemplatesOpen(true)} summary="管理" />
    </section>
    <section className="notification-settings-section">
      <h2>期間予定</h2>
      <FormRow ariaLabel="期間予定の期限時刻を変更" disabled={settingsBusy} label="期限時刻" onClick={() => setTimeTarget("deadline")} summary={defaults.periodDefaultDeadlineTime} />
    </section>
    {settingsBusy ? <p className="settings-status" role="status">保存中…</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<TimeSheet key={timeTarget ?? "closed"} open={Boolean(timeTarget)} title={timeTitle} value={timeValue} onClose={() => setTimeTarget(null)} onSave={saveTime} /><TemplateManager onClose={() => setTemplatesOpen(false)} open={templatesOpen} />
  </section>;
}
