import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isStagingNotificationOrigin, NotificationOffsetPicker, NotificationSettingsSection, notificationSummary } from "./NotificationSettings";

const settings = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "", updatedAt: "" };

describe("notification settings UI", () => {
  it("only enables the temporary test push origin for LifeHub staging", () => {
    expect(isStagingNotificationOrigin("https://lifehub-staging.427harinn.workers.dev")).toBe(true);
    expect(isStagingNotificationOrigin("https://lifehub.427harinn.workers.dev")).toBe(false);
    expect(isStagingNotificationOrigin("http://localhost:5173")).toBe(false);
  });

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
    expect(screen.getByRole("button", { name: "通知テンプレートを開く" })).toBeInTheDocument();
  });
});
