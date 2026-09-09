import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./vapid";

describe("VAPID public key decoding", () => {
  it("decodes URL-safe base64 without exposing or generating secrets", () => {
    expect([...urlBase64ToUint8Array("AQID-_w")]).toEqual([1, 2, 3, 251, 252]);
  });

  it("rejects malformed keys", () => {
    expect(() => urlBase64ToUint8Array("")).toThrow("invalid-vapid-public-key");
    expect(() => urlBase64ToUint8Array("not base64")).toThrow("invalid-vapid-public-key");
  });
});
