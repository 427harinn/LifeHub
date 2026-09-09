import { mkdir, writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import { isAbsolute, relative, resolve } from "node:path";

const outputDirectory = process.argv[2];
const subject = process.argv[3];
if (!outputDirectory || !subject || !/^(mailto:|https:)/.test(subject)) {
  throw new Error("Usage: node scripts/generate-vapid-secrets.mjs <repo-external-output-directory> <mailto-or-https-subject>");
}
const output = resolve(outputDirectory);
const repoRelative = relative(process.cwd(), output);
if (repoRelative === "" || (!repoRelative.startsWith("..") && !isAbsolute(repoRelative))) throw new Error("Output directory must be outside the repository.");
const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "WEB_PUSH_VAPID_PRIVATE_KEY"), privateJwk.d, { mode: 0o600 });
await writeFile(resolve(output, "WEB_PUSH_VAPID_PUBLIC_KEY"), Buffer.from(publicRaw).toString("base64url"), { mode: 0o600 });
await writeFile(resolve(output, "WEB_PUSH_SUBJECT"), subject, { mode: 0o600 });
console.log(`Generated VAPID files outside the repository: ${output}`);
