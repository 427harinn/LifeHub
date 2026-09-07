import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./constants";

const isSecureEnvironment = (environment?: string): boolean =>
  environment === "staging" || environment === "production";

export const createSessionCookie = (token: string, environment?: string): string => {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (isSecureEnvironment(environment)) attributes.push("Secure");
  return attributes.join("; ");
};

export const createExpiredSessionCookie = (environment?: string): string => {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ];
  if (isSecureEnvironment(environment)) attributes.push("Secure");
  return attributes.join("; ");
};

export const readCookie = (request: Request, name: string): string | null => {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
};
