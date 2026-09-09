import { base64UrlToBytes, bytesToBase64Url } from "../lib/crypto";
import { PushSubscriptionRepository, type PushSubscriptionRecord } from "../repositories/push-subscription-repository";

export type WebPushFailure = { stage: "config" | "subscription" | "vapid" | "encryption" | "network" | "push_service"; errorCategory: string; upstreamStatus: number | null };
export type WebPushSendResult = { sent: number; failed: number; failure?: WebPushFailure };
type PushEnv = { APP_ENV?: string; WEB_PUSH_VAPID_PUBLIC_KEY?: string; WEB_PUSH_VAPID_PRIVATE_KEY?: string; WEB_PUSH_SUBJECT?: string };
type Attempt = { status: "sent"; upstreamStatus: number } | { status: "stale" | "failed"; failure: WebPushFailure };
class ClassifiedError extends Error { constructor(readonly failure: WebPushFailure) { super("web-push-classified-failure"); } }

const fail = (stage: WebPushFailure["stage"], errorCategory: string, upstreamStatus: number | null = null): WebPushFailure => ({ stage, errorCategory, upstreamStatus });
const logFailure = (env: PushEnv, value: WebPushFailure) => {
  if (!["staging", "local", "development", "test"].includes(env.APP_ENV ?? "")) return;
  console.error(JSON.stringify({ event: "lifehub_web_push_failed", stage: value.stage, errorCategory: value.errorCategory, upstreamStatus: value.upstreamStatus }));
};

const encoder = new TextEncoder();
const toBuffer = (value: Uint8Array): ArrayBuffer => new Uint8Array(value).buffer;
const concat = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};
const hmac = async (keyBytes: Uint8Array, data: Uint8Array) => {
  const key = await crypto.subtle.importKey("raw", toBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toBuffer(data)));
};
const hkdf = async (prk: Uint8Array, label: Uint8Array, length: number) => {
  let previous = new Uint8Array();
  const result = new Uint8Array(length);
  let offset = 0;
  for (let counter = 1; offset < length; counter += 1) {
    previous = await hmac(prk, concat(previous, label, new Uint8Array([counter])));
    const chunk = previous.subarray(0, Math.min(previous.length, length - offset));
    result.set(chunk, offset); offset += chunk.length;
  }
  return result;
};
const info = (value: string) => concat(encoder.encode(value), new Uint8Array([0]));

const encryptPayload = async (subscription: PushSubscriptionRecord, payload: string) => {
  const userPublicBytes = base64UrlToBytes(subscription.p256dh);
  const auth = base64UrlToBytes(subscription.auth);
  if (userPublicBytes.length !== 65) throw new Error("invalid-p256dh");
  if (auth.length !== 16) throw new Error("invalid-auth");
  const userPublic = await crypto.subtle.importKey("raw", toBuffer(userPublicBytes), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: userPublic }, ephemeral.privateKey, 256));
  const prk = await hmac(auth, shared);
  const ikm = await hkdf(prk, concat(encoder.encode("WebPush: info\0"), userPublicBytes, ephemeralPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltPrk = await hmac(salt, ikm);
  const cek = await hkdf(saltPrk, info("Content-Encoding: aes128gcm"), 16);
  const nonce = await hkdf(saltPrk, info("Content-Encoding: nonce"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuffer(nonce) }, key, toBuffer(concat(encoder.encode(payload), new Uint8Array([2])))));
  const header = new Uint8Array(21 + ephemeralPublic.length);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = ephemeralPublic.length; header.set(ephemeralPublic, 21);
  return concat(header, ciphertext);
};

const parsePrivateJwk = (value: string): JsonWebKey => {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || (parsed as JsonWebKey).kty !== "EC" || (parsed as JsonWebKey).crv !== "P-256" || !(parsed as JsonWebKey).d || !(parsed as JsonWebKey).x || !(parsed as JsonWebKey).y) throw new Error("invalid-vapid-private-key");
  return parsed;
};
const vapidAuthorization = async (endpoint: string, subject: string, privateText: string, publicKey: string) => {
  let privateKey: CryptoKey;
  try { privateKey = await crypto.subtle.importKey("jwk", parsePrivateJwk(privateText), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]); }
  catch { throw new ClassifiedError(fail("vapid", "vapid_key_import_failed")); }
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToBase64Url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 43_200, sub: subject })));
  try {
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, toBuffer(encoder.encode(`${header}.${body}`))));
    return `vapid t=${header}.${body}.${bytesToBase64Url(signature)}, k=${publicKey}`;
  } catch { throw new ClassifiedError(fail("vapid", "vapid_sign_failed")); }
};

export class WebPushService {
  private readonly subscriptions: PushSubscriptionRepository;
  constructor(db: D1Database, private readonly fetcher: typeof fetch = fetch) { this.subscriptions = new PushSubscriptionRepository(db); }

  async sendPayload(userId: string, payload: object, env: PushEnv): Promise<WebPushSendResult> {
    const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = env.WEB_PUSH_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject || !/^(mailto:|https:)/.test(subject)) {
      const value = fail("config", "missing_config"); logFailure(env, value); throw new Error("push-config-missing");
    }
    const subscriptions = await this.subscriptions.listActive(userId);
    let sent = 0; let failed = 0; let firstFailure: WebPushFailure | undefined;
    for (const subscription of subscriptions) {
      const result = await this.sendOne(subscription, payload, publicKey, privateKey, subject);
      if (result.status === "sent") sent += 1;
      else { failed += 1; firstFailure ??= result.failure; logFailure(env, result.failure); }
    }
    return { sent, failed, ...(firstFailure ? { failure: firstFailure } : {}) };
  }

  private async sendOne(subscription: PushSubscriptionRecord, payload: object, publicKey: string, privateKey: string, subject: string): Promise<Attempt> {
    let body: Uint8Array;
    try { body = await encryptPayload(subscription, JSON.stringify(payload)); }
    catch (error) { return { status: "failed", failure: fail("encryption", error instanceof Error && ["invalid-p256dh", "invalid-auth"].includes(error.message) ? "invalid_subscription" : "payload_encrypt_failed") }; }
    let authorization: string;
    try { authorization = await vapidAuthorization(subscription.endpoint, subject, privateKey, publicKey); }
    catch (error) { return { status: "failed", failure: error instanceof ClassifiedError ? error.failure : fail("vapid", "unknown") }; }
    let response: Response;
    try {
      response = await this.fetcher(subscription.endpoint, { method: "POST", headers: { Authorization: authorization, "Content-Encoding": "aes128gcm", TTL: "60", "Content-Type": "application/octet-stream" }, body: toBuffer(body) });
    } catch { return { status: "failed", failure: fail("network", "network_failed") }; }
    const now = new Date().toISOString();
    if (response.status >= 200 && response.status < 300) { await this.subscriptions.markSuccess(subscription.id, now); return { status: "sent", upstreamStatus: response.status }; }
    if (response.status === 404 || response.status === 410) { await this.subscriptions.markDisabled(subscription.id, now); return { status: "stale", failure: fail("push_service", "push_service_stale", response.status) }; }
    await this.subscriptions.markFailure(subscription.id, now);
    const category = response.status === 401 || response.status === 403 ? "push_service_auth_failed" : response.status === 429 ? "push_service_rate_limited" : response.status >= 500 ? "push_service_server_error" : response.status >= 400 ? "push_service_client_error" : "unknown";
    return { status: "failed", failure: fail("push_service", category, response.status) };
  }
}
