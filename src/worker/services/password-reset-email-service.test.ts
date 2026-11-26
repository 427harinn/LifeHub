import { describe, expect, it } from "vitest";
import { createPasswordResetEmailSender, HttpPasswordResetEmailSender } from "./password-reset-email-service";

const stubFetch = (response: Response) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(response);
  };
  return { calls, fetchFn };
};

describe("password reset email sender", () => {
  it("returns null when delivery is not configured", () => {
    expect(createPasswordResetEmailSender({})).toBeNull();
    expect(createPasswordResetEmailSender({ PASSWORD_RESET_EMAIL_API_KEY: "key" })).toBeNull();
    expect(createPasswordResetEmailSender({ PASSWORD_RESET_EMAIL_FROM: "LifeHub <noreply@example.com>" })).toBeNull();
  });

  it("returns a sender when both the API key and From are configured", () => {
    expect(createPasswordResetEmailSender({ PASSWORD_RESET_EMAIL_API_KEY: "key", PASSWORD_RESET_EMAIL_FROM: "LifeHub <noreply@example.com>" })).not.toBeNull();
  });

  it("posts the reset link to the email API with bearer auth", async () => {
    const { calls, fetchFn } = stubFetch(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    const sender = new HttpPasswordResetEmailSender("secret-key", "LifeHub <noreply@example.com>", "https://api.resend.com/emails", fetchFn);
    await sender.sendPasswordResetEmail({ to: "me@example.com", resetUrl: "https://lifehub.test/password-reset?token=abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    const rawBody = calls[0].init.body;
    if (typeof rawBody !== "string") throw new Error("expected a string request body");
    const body = JSON.parse(rawBody) as { from: string; to: string[]; subject: string; text: string };
    expect(body.from).toBe("LifeHub <noreply@example.com>");
    expect(body.to).toEqual(["me@example.com"]);
    expect(body.text).toContain("https://lifehub.test/password-reset?token=abc");
    expect(body.text).toContain("30分");
  });

  it("throws when the email API rejects the request", async () => {
    const { fetchFn } = stubFetch(new Response("nope", { status: 403 }));
    const sender = new HttpPasswordResetEmailSender("secret-key", "LifeHub <noreply@example.com>", "https://api.resend.com/emails", fetchFn);
    await expect(sender.sendPasswordResetEmail({ to: "me@example.com", resetUrl: "https://lifehub.test/password-reset?token=abc" })).rejects.toThrow(/403/);
  });
});
