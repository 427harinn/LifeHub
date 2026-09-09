import { useEffect, useState } from "react";
import { createNotificationTemplate, deleteNotificationTemplate, getNotificationTemplates, getVapidPublicKey, registerPushSubscription, unregisterPushSubscription, updateNotificationTemplate } from "../api/notifications";
import { updateSettings } from "../api/client";
import type { NotificationTemplate, UserSettings } from "../worker/types";
import { BottomSheet, Button, FormRow, Input } from "./ui";
import { getBrowserCapabilities } from "../lib/capabilities";
import { urlBase64ToUint8Array } from "../lib/vapid";

export const notificationOffsetLabel = (offset: number) => offset === 10 ? "10分前" : offset === 30 ? "30分前" : offset === 60 ? "1時間前" : offset === 1440 ? "1日前" : `${offset}分前`;
export const notificationSummary = (offsets: number[]) => {
  const values = [...new Set(offsets)].sort((left, right) => right - left);
  if (values.length === 0) return "なし";
  if (values.length > 2) return `${values.length}件`;
  return values.map(notificationOffsetLabel).join("、");
};

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

function TemplateManager({ open, onClose, category }: { open: boolean; onClose: () => void; category?: "home" | "work" }) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [name, setName] = useState("");
  const [offsets, setOffsets] = useState<number[]>([]);
  const [error, setError] = useState("");
  const load = async () => { try { const result = await getNotificationTemplates(); setTemplates(result.templates ?? []); } catch { setError("テンプレートを読み込めませんでした。"); } };
  useEffect(() => { if (!open) return; void getNotificationTemplates().then((result) => setTemplates(result.templates ?? [])).catch(() => setError("テンプレートを読み込めませんでした。")); }, [open]);
  const startCreate = () => { setEditing(null); setName(""); setOffsets([1440, 30]); setError(""); };
  const startEdit = (template: NotificationTemplate) => { setEditing(template); setName(template.name); setOffsets(template.offsets.map((offset) => offset.offsetMinutes)); setError(""); };
  const save = async () => { if (!name.trim()) { setError("テンプレート名を入力してください。"); return; } try { if (editing) await updateNotificationTemplate(editing.id, { name: name.trim(), offsets }); else await createNotificationTemplate({ name: name.trim(), offsets, isDefault: templates.length === 0 }); await load(); setEditing(null); } catch { setError("テンプレートを保存できませんでした。"); } };
  const remove = async () => { if (!editing) return; try { await deleteNotificationTemplate(editing.id); await load(); setEditing(null); } catch { setError("テンプレートを削除できませんでした。"); } };
  return <BottomSheet open={open} title="通知テンプレート" onClose={onClose}>{editing || name ? <div className="template-editor"><label className="input-field" htmlFor="template-name"><span>名前</span><Input id="template-name" onChange={setName} value={name} /></label><NotificationOffsetPicker offsets={offsets} onChange={setOffsets} /><p className="notification-summary-preview">{notificationSummary(offsets)}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button onClick={() => { void save(); }}>{editing ? "変更を保存" : "作成"}</Button>{editing ? <Button onClick={() => { void remove(); }} variant="secondary">削除</Button> : null}<Button onClick={() => setEditing(null)} variant="ghost">戻る</Button></div> : <div className="template-list"><div className="template-list__rows">{templates.map((template) => <FormRow key={template.id} label={template.name} onClick={() => startEdit(template)} summary={notificationSummary(template.offsets.map((offset) => offset.offsetMinutes))} />)}{templates.length === 0 ? <p className="empty-state">テンプレートはありません</p> : null}</div><Button onClick={startCreate}>テンプレートを追加</Button>{category ? <p className="empty-state">{category === "home" ? "家" : "仕事"}の予定に適用できます。</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</div>}</BottomSheet>;
}

async function ensurePushSubscription() {
  const capabilities = getBrowserCapabilities();
  if (!capabilities.serviceWorkerSupported || !capabilities.pushManagerSupported || !capabilities.notificationSupported) throw new Error("この端末では通知を利用できません。");
  if (capabilities.homeScreenInstallRequired) throw new Error("iPhoneではLifeHubをホーム画面に追加したPWAで通知を有効にしてください。");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("通知の許可が必要です。");
  const registration = await navigator.serviceWorker.getRegistration("/") ?? await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const current = await registration.pushManager.getSubscription();
  const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array((await getVapidPublicKey()).publicKey).buffer as ArrayBuffer });
  await registerPushSubscription(subscription);
}

export function NotificationSettingsSection({ settings, onSettingsChange }: { settings: UserSettings | null; onSettingsChange: (settings: UserSettings) => void }) {
  const defaults = settings ?? { userId: "", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "", updatedAt: "" };
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [timeTarget, setTimeTarget] = useState<"morning" | "evening" | "deadline" | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  useEffect(() => { let active = true; const load = async () => { const capabilities = getBrowserCapabilities(); if (!capabilities.notificationSupported || capabilities.notificationPermission !== "granted" || !capabilities.serviceWorkerSupported) { if (active) setDeviceOn(false); return; } const registration = await navigator.serviceWorker.getRegistration("/"); const subscription = await registration?.pushManager.getSubscription(); if (active) setDeviceOn(Boolean(subscription)); }; void load(); return () => { active = false; }; }, []);
  const patchSettings = async (patch: Partial<UserSettings>) => { try { const result = await updateSettings(patch); onSettingsChange(result.settings); } catch { setError("通知設定を保存できませんでした。"); } };
  const toggleDevice = async () => { setBusy(true); setError(""); try { if (deviceOn) { const registration = await navigator.serviceWorker.getRegistration("/"); const subscription = await registration?.pushManager.getSubscription(); if (subscription) { await subscription.unsubscribe(); await unregisterPushSubscription(subscription.endpoint); } setDeviceOn(false); } else { await ensurePushSubscription(); setDeviceOn(true); } } catch (caught) { setError(caught instanceof Error ? caught.message : "通知を変更できませんでした。"); } finally { setBusy(false); } };
  const timeTitle = timeTarget === "morning" ? "朝のまとめ通知" : timeTarget === "evening" ? "夜のまとめ通知" : "期間予定の期限時刻";
  const timeValue = timeTarget === "morning" ? defaults.morningSummaryTime : timeTarget === "evening" ? defaults.eveningSummaryTime : defaults.periodDefaultDeadlineTime;
  const saveTime = async (value: string) => { if (!timeTarget) return; await patchSettings(timeTarget === "morning" ? { morningSummaryTime: value } : timeTarget === "evening" ? { eveningSummaryTime: value } : { periodDefaultDeadlineTime: value }); setTimeTarget(null); };
  return <section className="notification-settings"><FormRow ariaLabel="この端末の通知を変更" label="この端末の通知" onClick={() => { if (!busy) void toggleDevice(); }} summary={deviceOn ? "ON" : "OFF"} /><FormRow ariaLabel="朝のまとめ通知を切り替え" label="朝のまとめ通知" onClick={() => { void patchSettings({ morningSummaryEnabled: !defaults.morningSummaryEnabled }); }} summary={defaults.morningSummaryEnabled ? "ON" : "OFF"} /><FormRow ariaLabel="朝のまとめ通知時刻を変更" label="朝のまとめ通知時刻" onClick={() => setTimeTarget("morning")} summary={`${defaults.morningSummaryTime} ›`} /><FormRow ariaLabel="夜のまとめ通知を切り替え" label="夜のまとめ通知" onClick={() => { void patchSettings({ eveningSummaryEnabled: !defaults.eveningSummaryEnabled }); }} summary={defaults.eveningSummaryEnabled ? "ON" : "OFF"} /><FormRow ariaLabel="夜のまとめ通知時刻を変更" label="夜のまとめ通知時刻" onClick={() => setTimeTarget("evening")} summary={`${defaults.eveningSummaryTime} ›`} /><FormRow ariaLabel="期間予定の期限時刻を変更" label="期間予定の期限時刻" onClick={() => setTimeTarget("deadline")} summary={`${defaults.periodDefaultDeadlineTime} ›`} /><FormRow ariaLabel="通知テンプレートを開く" label="通知テンプレート" onClick={() => setTemplatesOpen(true)} summary="管理 ›" />{error ? <p className="form-error" role="alert">{error}</p> : null}<TimeSheet key={timeTarget ?? "closed"} open={Boolean(timeTarget)} title={timeTitle} value={timeValue} onClose={() => setTimeTarget(null)} onSave={saveTime} /><TemplateManager category="home" onClose={() => setTemplatesOpen(false)} open={templatesOpen} /></section>;
}
