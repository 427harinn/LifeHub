import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuidePage } from "./GuidePage";

describe("GuidePage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows seven guide images and dots, starts on page one, and updates the page after scrolling", async () => {
    const onClose = vi.fn();
    render(<GuidePage onClose={onClose} />);

    expect(screen.getByRole("main", { name: "使い方ガイド" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(7);
    expect(document.querySelectorAll(".guide-page__dot")).toHaveLength(7);
    expect(document.querySelector(".guide-page__dot.is-active")).toBe(document.querySelectorAll(".guide-page__dot")[0]);
    expect(screen.getByText("現在のページ: 1")).toBeInTheDocument();

    const scroller = screen.getByLabelText("使い方ガイドのページ。左右にスワイプして見られます");
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 390 });
    Object.defineProperty(scroller, "scrollLeft", { configurable: true, writable: true, value: 390 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    act(() => {
      fireEvent.scroll(scroller);
    });
    await waitFor(() => expect(screen.getByText("現在のページ: 2")).toBeInTheDocument());
    expect(document.querySelectorAll(".guide-page__dot.is-active")).toHaveLength(1);
    expect(document.querySelectorAll(".guide-page__dot.is-active")[0]).toBe(document.querySelectorAll(".guide-page__dot")[1]);

    fireEvent.click(screen.getByRole("button", { name: "使い方を閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves one page with the arrow keys", () => {
    const scrollTo = vi.fn();
    render(<GuidePage onClose={vi.fn()} />);
    const scroller = screen.getByLabelText("使い方ガイドのページ。左右にスワイプして見られます");
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 390 });
    scroller.scrollTo = scrollTo;

    fireEvent.keyDown(scroller, { key: "ArrowRight" });
    expect(scrollTo).toHaveBeenCalledWith({ left: 390, behavior: "smooth" });
  });
});
