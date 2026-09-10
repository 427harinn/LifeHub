import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet", () => {
  it("portals the viewport overlay outside transformed form containers", () => {
    const { container } = render(<div style={{ overflow: "hidden", transform: "translateY(1px)" }}><BottomSheet open onClose={vi.fn()} title="確認"><p>内容</p></BottomSheet></div>);
    const layer = screen.getByRole("dialog", { name: "確認" }).parentElement;
    expect(layer).toHaveClass("bottom-sheet-layer");
    expect(layer?.parentElement).toBe(document.body);
    expect(container.querySelector(".bottom-sheet-layer")).toBeNull();
  });
});
