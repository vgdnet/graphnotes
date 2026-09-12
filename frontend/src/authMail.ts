export const DEFAULT_MAIL_CODE_TTL_MINUTES = 30;

export type AuthMailPurpose = "confirm" | "login" | "reset" | "invite";

export function parseAuthHash(
  hash: string,
): { purpose: AuthMailPurpose; token: string } | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = value.match(/^\/auth\/(confirm|login-code|reset|invite)\?token=([^&]+)$/);
  if (!match) return null;
  const purpose: AuthMailPurpose =
    match[1] === "confirm"
      ? "confirm"
      : match[1] === "reset"
        ? "reset"
        : match[1] === "invite"
          ? "invite"
          : "login";
  return { purpose, token: decodeURIComponent(match[2]) };
}

export function mailCodeExpired(
  startedAtMs: number,
  ttlMinutes: number,
  nowMs = Date.now(),
): boolean {
  return nowMs >= startedAtMs + ttlMinutes * 60 * 1000;
}

export function remainingMailCodeMs(
  startedAtMs: number,
  ttlMinutes: number,
  nowMs = Date.now(),
): number {
  return Math.max(0, startedAtMs + ttlMinutes * 60 * 1000 - nowMs);
}

export type ResetFormPhase = "request" | "set-password";
export type LoginFormPhase = "password" | "request" | "enter-code";

export function resetFormPhase(
  token: string,
  startedAtMs: number | null,
  ttlMinutes: number,
  nowMs = Date.now(),
): ResetFormPhase {
  if (!token) return "request";
  if (startedAtMs != null && mailCodeExpired(startedAtMs, ttlMinutes, nowMs)) {
    return "request";
  }
  return "set-password";
}

export function loginFormPhase(
  mailRequested: boolean,
  startedAtMs: number | null,
  ttlMinutes: number,
  nowMs = Date.now(),
): LoginFormPhase {
  if (!mailRequested) return "password";
  if (startedAtMs != null && !mailCodeExpired(startedAtMs, ttlMinutes, nowMs)) {
    return "enter-code";
  }
  return "request";
}
