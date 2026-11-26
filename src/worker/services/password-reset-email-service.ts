// Password reset email delivery.
//
// LifeHub has no mail infrastructure of its own, so delivery goes through a
// transactional email API (Resend by default; any endpoint that accepts the
// same JSON shape works). Configuration is entirely via Worker secrets/vars:
//   PASSWORD_RESET_EMAIL_API_KEY  (secret, required)
//   PASSWORD_RESET_EMAIL_FROM     (required, e.g. "LifeHub <noreply@example.com>")
//   PASSWORD_RESET_EMAIL_API_URL  (optional, defaults to Resend)
// When unconfigured, the factory returns null and the request endpoint keeps
// responding uniformly without sending (tokens are still created, so enabling
// delivery later needs no data migration).

export type PasswordResetEmailSender = {
  sendPasswordResetEmail(input: { to: string; resetUrl: string }): Promise<void>;
};

export type PasswordResetEmailBindings = {
  PASSWORD_RESET_EMAIL_API_KEY?: string;
  PASSWORD_RESET_EMAIL_FROM?: string;
  PASSWORD_RESET_EMAIL_API_URL?: string;
};

const DEFAULT_API_URL = "https://api.resend.com/emails";

export class HttpPasswordResetEmailSender implements PasswordResetEmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly apiUrl: string = DEFAULT_API_URL,
    // Wrap the global fetch: calling it as an object method throws
    // "Illegal invocation" in the Workers runtime.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init)
  ) {}

  async sendPasswordResetEmail(input: { to: string; resetUrl: string }): Promise<void> {
    const response = await this.fetchFn(this.apiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: "LifeHub パスワード再設定のご案内",
        text: [
          "LifeHubのパスワード再設定を受け付けました。",
          "",
          "下記のリンクから30分以内に新しいパスワードを設定してください。",
          input.resetUrl,
          "",
          "このメールに心当たりがない場合は、リンクを開かずにそのまま破棄してください。",
          "パスワードは変更されません。"
        ].join("\n")
      })
    });
    if (!response.ok) throw new Error(`Password reset email delivery failed with status ${response.status}`);
  }
}

export const createPasswordResetEmailSender = (bindings: PasswordResetEmailBindings): PasswordResetEmailSender | null => {
  const apiKey = bindings.PASSWORD_RESET_EMAIL_API_KEY?.trim();
  const from = bindings.PASSWORD_RESET_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  const apiUrl = bindings.PASSWORD_RESET_EMAIL_API_URL?.trim() || DEFAULT_API_URL;
  return new HttpPasswordResetEmailSender(apiKey, from, apiUrl);
};
