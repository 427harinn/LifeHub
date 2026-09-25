import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet", () => {
  it("locks the body with a fixed offset and restores its exact style and scroll position", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollX", { configurable: true, value: 24 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 240 });
    document.body.setAttribute("style", "color: red; overflow: auto;");
    const { rerender } = render(<BottomSheet open onClose={vi.fn()} title="確認"><p>内容</p></BottomSheet>);

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    expect(document.body.style.left).toBe("-24px");
    expect(document.body.style.width).toBe("100%");
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<div />);
    expect(document.body.getAttribute("style")).toBe("color: red; overflow: auto;");
    expect(scrollTo).toHaveBeenCalledWith(24, 240);
    scrollTo.mockRestore();
  });

  it("keeps the body locked until the last nested sheet closes", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 180 });
    const { rerender } = render(<><BottomSheet open onClose={vi.fn()} title="親"><p>親</p></BottomSheet><BottomSheet open onClose={vi.fn()} title="子"><p>子</p></BottomSheet></>);

    rerender(<><BottomSheet open={false} onClose={vi.fn()} title="親"><p>親</p></BottomSheet><BottomSheet open onClose={vi.fn()} title="子"><p>子</p></BottomSheet></>);
    expect(document.body.style.position).toBe("fixed");
    expect(scrollTo).not.toHaveBeenCalled();

    rerender(<><BottomSheet open={false} onClose={vi.fn()} title="親"><p>親</p></BottomSheet><BottomSheet open={false} onClose={vi.fn()} title="子"><p>子</p></BottomSheet></>);
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 180);
    scrollTo.mockRestore();
  });

  it("portals the viewport overlay outside transformed form containers", () => {
    const { container } = render(<div style={{ overflow: "hidden", transform: "translateY(1px)" }}><BottomSheet open onClose={vi.fn()} title="確認"><p>内容</p></BottomSheet></div>);
    const layer = screen.getByRole("dialog", { name: "確認" }).parentElement;
    expect(layer).toHaveClass("bottom-sheet-layer");
    expect(layer?.parentElement).toBe(document.body);
    expect(container.querySelector(".bottom-sheet-layer")).toBeNull();
  });

  it("keeps a normal tap clickable when no sheet drag capture was taken", () => {
    const onClick = vi.fn();
    render(<BottomSheet open onClose={vi.fn()} title="確認"><button onClick={onClick} type="button">保存</button></BottomSheet>);
    const dialog = screen.getByRole("dialog", { name: "確認" });
    fireEvent.pointerDown(dialog);
    fireEvent.pointerUp(dialog);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("focuses the first sheet control, traps Tab in both directions, and restores the opener", async () => {
    const onClose = vi.fn();
    // Keep the test focused on the modal contract rather than browser-specific visibility heuristics.
    const { rerender } = render(<button type="button">開く</button>);
    const opener = screen.getByRole("button", { name: "開く" });
    opener.focus();
    rerender(<><button type="button">開く</button><BottomSheet open onClose={onClose} title="確認"><button type="button">保存</button><button type="button">キャンセル</button></BottomSheet></>);
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
    rerender(<button type="button">開く</button>);
    expect(screen.getByRole("button", { name: "開く" })).toHaveFocus();
  });

  it("makes the background inert and only closable sheets react to Escape", () => {
    const background = document.createElement("div");
    document.body.appendChild(background);
    const onClose = vi.fn();
    const { rerender } = render(<BottomSheet open closable={false} onClose={onClose} title="確認"><button type="button">保存</button></BottomSheet>);
    expect(background.inert).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    rerender(<BottomSheet open onClose={onClose} title="確認"><button type="button">保存</button></BottomSheet>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    background.remove();
  });

  it("closes through the backdrop when closable", () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="確認"><button type="button">保存</button></BottomSheet>);
    fireEvent.click(screen.getByRole("button", { name: "背景を閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
