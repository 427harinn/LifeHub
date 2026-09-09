import { apiRequest } from "./client";
import type { NotificationTemplate } from "../worker/types";

export const getVapidPublicKey = () => apiRequest<{ publicKey: string }>("/api/notifications/vapid-public-key");
export const registerPushSubscription = (subscription: PushSubscription) => apiRequest<{ registered: boolean }>("/api/notifications/subscriptions", { method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys }) });
export const unregisterPushSubscription = (endpoint: string) => apiRequest<{ removed: boolean }>("/api/notifications/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
export const getNotificationTemplates = () => apiRequest<{ templates: NotificationTemplate[] }>("/api/notification-templates");
export const createNotificationTemplate = (input: { name: string; offsets: number[]; isDefault?: boolean }) => apiRequest<{ template: NotificationTemplate }>("/api/notification-templates", { method: "POST", body: JSON.stringify(input) });
export const updateNotificationTemplate = (id: string, input: { name?: string; offsets?: number[]; isDefault?: boolean }) => apiRequest<{ template: NotificationTemplate }>(`/api/notification-templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteNotificationTemplate = (id: string) => apiRequest<{ deleted: boolean }>(`/api/notification-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
