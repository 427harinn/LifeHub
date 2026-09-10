import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwipeActionRow } from "./SwipeActionRow";

describe("SwipeActionRow", () => {
  it("translates the complete foreground while the edit action is revealed", () => {
    render(<SwipeActionRow actions={[{ label: "編集", onClick: vi.fn() }]} ariaLabel="電気代"><button type="button">○ 電気代 食費 -5,000円</button></SwipeActionRow>);
    const row = screen.getByRole("article", { name: "電気代" });
    const content = row.querySelector<HTMLElement>(".event-swipe-row__content");
    if (!content) throw new Error("swipe foreground not found");
    fireEvent.pointerDown(row, { clientX: 300, clientY: 30, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(row, { clientX: 220, clientY: 30, pointerId: 1, pointerType: "touch" });
    expect(content.style.getPropertyValue("--event-swipe-offset")).toBe("-80px");
    fireEvent.pointerUp(row, { clientX: 220, clientY: 30, pointerId: 1, pointerType: "touch" });
    expect(screen.getByRole("button", { name: "編集" })).toBeVisible();
    expect(content.style.getPropertyValue("--event-swipe-offset")).toBe("-80px");
  });

  it("signals detail close before revealing the action", () => {
    const onHorizontalSwipeStart = vi.fn();
    render(<SwipeActionRow actions={[{ label: "編集", onClick: vi.fn() }]} ariaLabel="電気代" expandedContent={<div>詳細</div>} onHorizontalSwipeStart={onHorizontalSwipeStart}><button type="button">電気代</button></SwipeActionRow>);
    const row = screen.getByRole("article", { name: "電気代" });
    fireEvent.pointerDown(row, { clientX: 300, clientY: 30, pointerId: 2, pointerType: "touch" });
    fireEvent.pointerMove(row, { clientX: 220, clientY: 30, pointerId: 2, pointerType: "touch" });
    fireEvent.pointerUp(row, { clientX: 220, clientY: 30, pointerId: 2, pointerType: "touch" });
    expect(onHorizontalSwipeStart).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "編集" })).toBeVisible();
  });
});
