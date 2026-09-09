export const urlBase64ToUint8Array = (value: string): Uint8Array => {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid-vapid-public-key");
  try { const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
  catch { throw new Error("invalid-vapid-public-key"); }
};
