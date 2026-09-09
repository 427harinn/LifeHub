import { describe, expect, it } from "vitest";
import { bytesToBase64Url } from "../lib/crypto";
import { invokeFetchWithoutReceiver, parsePrivateJwk } from "./web-push-service";

describe("VAPID private key formats", () => {
  it("accepts the URL-safe base64 private scalar emitted by web-push", () => {
    const privateBytes = new Uint8Array(32);
    privateBytes[31] = 1;
    const publicBytes = new Uint8Array(65);
    publicBytes[0] = 4;
    publicBytes[32] = 2;
    publicBytes[64] = 3;
    const jwk = parsePrivateJwk(bytesToBase64Url(privateBytes), bytesToBase64Url(publicBytes));
    expect(jwk).toMatchObject({ kty: "EC", crv: "P-256", d: bytesToBase64Url(privateBytes), x: bytesToBase64Url(publicBytes.slice(1, 33)), y: bytesToBase64Url(publicBytes.slice(33)) });
  });

  it("keeps accepting a JSON JWK for existing LifeHub/HouseToDo-compatible secrets", () => {
    const jwk = parsePrivateJwk(JSON.stringify({ kty: "EC", crv: "P-256", d: "private", x: "public-x", y: "public-y" }), "unused-public-key");
    expect(jwk).toMatchObject({ kty: "EC", crv: "P-256", d: "private", x: "public-x", y: "public-y" });
  });

  it("rejects malformed private key formats without exposing the value", () => {
    expect(() => parsePrivateJwk("not-a-key", "not-a-public-key")).toThrow("invalid-vapid-private-key");
  });
});

describe("Web Push fetch invocation", () => {
  it("calls the Worker fetcher without a WebPushService receiver", async () => {
    const fetcher: typeof fetch = vi.fn(function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      expect(this).toBeUndefined();
      expect(input).toBe("https://push.example.test/endpoint");
      expect(init?.method).toBe("POST");
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    await expect(invokeFetchWithoutReceiver(fetcher, "https://push.example.test/endpoint", { method: "POST" })).resolves.toMatchObject({ status: 204 });
  });
});
