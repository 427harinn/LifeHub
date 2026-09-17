import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationOffsetPicker, NotificationSettingsSection, TemplateManager } from "./NotificationSettings";
import { notificationSummary } from "../lib/notification-labels";

const settings = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "", updatedAt: "" };

describe("notification settings UI", () => {
  it("summarizes multiple offsets without exposing raw minutes", () => {
    expect(notificationSummary([])).toBe("なし");
    expect(notificationSummary([30])).toBe("30分前");
    expect(notificationSummary([1440, 30])).toBe("1日前、30分前");
    expect(notificationSummary([10, 30, 60])).toBe("3件");
  });

  it("supports selecting multiple offset presets", () => {
    const onChange = vi.fn();
    render(<NotificationOffsetPicker offsets={[30]} onChange={onChange} />);
    expect(screen.getByLabelText("30分前")).toBeChecked();
    fireEvent.click(screen.getByLabelText("1日前"));
    expect(onChange).toHaveBeenCalledWith([1440, 30]);
  });

  it("keeps device subscription state separate from summary settings", () => {
    render(<NotificationSettingsSection onSettingsChange={vi.fn()} settings={settings} />);
    expect(screen.getByRole("button", { name: "この端末の通知を変更" })).toHaveTextContent("OFF");
    expect(screen.getByRole("button", { name: "朝のまとめ通知を切り替え" })).toHaveTextContent("ON");
    expect(screen.getByRole("button", { name: "夜のまとめ通知を切り替え" })).toHaveTextContent("ON");
    expect(screen.getByRole("button", { name: "通知テンプレートを管理" })).toBeInTheDocument();
    expect(screen.getAllByText("通知時刻")).toHaveLength(2);
  });

  it("hides summary time when its toggle is off", () => {
    render(<NotificationSettingsSection onSettingsChange={vi.fn()} settings={{ ...settings, morningSummaryEnabled: false }} />);
    expect(screen.getByRole("heading", { name: "朝のまとめ通知" }).parentElement).not.toHaveTextContent("09:00");
  });

  it("opens the usable template creation editor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ templates: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<TemplateManager onClose={vi.fn()} open />);
    await screen.findByText("テンプレートはありません");
    fireEvent.click(screen.getByRole("button", { name: "テンプレートを追加" }));
    expect(screen.getByLabelText("名前")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeInTheDocument();
  });

  it("renders one shared chevron for template rows and offers retry on load failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ templates: [{ id: "template-1", name: "朝の予定", offsets: [{ id: "offset-1", templateId: "template-1", offsetMinutes: 30 }] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<TemplateManager onClose={vi.fn()} open />);
    expect(await screen.findByRole("alert")).toHaveTextContent("テンプレートを読み込めませんでした。");
    fireEvent.click(screen.getByRole("button", { name: "テンプレートを再試行" }));
    const row = await screen.findByRole("button", { name: /朝の予定/ });
    expect(row.querySelectorAll(".form-row__chevron")).toHaveLength(1);
    expect((row.textContent?.match(/›/g) ?? []).length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
