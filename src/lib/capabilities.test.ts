import { describe, expect, it } from "vitest";
import { getBrowserCapabilities } from "./capabilities";

describe("browser notification capability detection", () => {
  it("does not request permission while inspecting capabilities", () => {
    const capabilities = getBrowserCapabilities();
    expect(capabilities.notificationPermission).toBe("unsupported");
    expect(capabilities.homeScreenInstallRequired).toBe(false);
  });
});
