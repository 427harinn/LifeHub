import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("LifeHub M1 foundation preview", () => {
  it("shows reusable controls in the mobile shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "LifeHub" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /ラベル入力/ })).toBeInTheDocument();
    expect(screen.getByText("フォーム行")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存する" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主要画面" })).toBeInTheDocument();
  });

  it("opens and closes the shared BottomSheet", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "表示設定" }));
    expect(screen.getByRole("dialog", { name: "表示設定" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "閉じる" })[0]);
    expect(screen.queryByRole("dialog", { name: "表示設定" })).not.toBeInTheDocument();
  });
});
