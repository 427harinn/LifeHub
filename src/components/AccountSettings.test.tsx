import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountSettings } from "./AccountSettings";

const changePassword = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ changePassword }));

const user = { id: "user-1", email: "user@example.com", displayName: "Test User" };

describe("Account password settings", () => {
  it("validates confirmation before sending", async () => {
    render(<AccountSettings onLogout={vi.fn()} user={user} />);
    fireEvent.change(screen.getByLabelText("現在のパスワード"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), { target: { value: "different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "パスワードを変更" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("新しいパスワードが一致しません。");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows busy and success feedback for a valid update", async () => {
    let resolve: (() => void) | undefined;
    changePassword.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    render(<AccountSettings onLogout={vi.fn()} user={user} />);
    fireEvent.change(screen.getByLabelText("現在のパスワード"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "パスワードを変更" }));
    expect(screen.getByRole("button", { name: "変更中…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "変更中…" }));
    expect(changePassword).toHaveBeenCalledTimes(1);
    resolve?.();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("パスワードを変更しました。"));
  });
});
