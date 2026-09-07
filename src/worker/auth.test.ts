import { describe, expect, it } from "vitest";
import { createExpiredSessionCookie, createSessionCookie, readCookie } from "./lib/cookies";
import { hashPassword, sha256Hex, verifyPassword } from "./lib/crypto";

describe("LifeHub auth primitives", () => {
  it("hashes and verifies passwords without storing the raw password", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);
    expect(hash).toContain("pbkdf2-sha256");
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("uses a hash for session tokens and HttpOnly cookies", async () => {
    const token = "session-token";
    await expect(sha256Hex(token)).resolves.toMatch(/^[a-f0-9]{64}$/);
    const cookie = createSessionCookie(token, "local");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(readCookie(new Request("https://lifehub.test", { headers: { cookie } }), "lifehub_session")).toBe(token);
    expect(createExpiredSessionCookie("local")).toContain("Max-Age=0");
  });
});
