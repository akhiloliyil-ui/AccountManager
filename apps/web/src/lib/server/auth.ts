import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSignInThrottle, issueSession, SESSION_MAX_AGE_S, verifySession, type Access, type Db, type UserRow } from "@gpa/db";
import { SESSION_COOKIE } from "../session-cookie";

const g = globalThis as { __gpaThrottles?: Map<string, ReturnType<typeof createSignInThrottle>> };
const throttles = (g.__gpaThrottles ??= new Map());

/** One throttle per username, so guessing one person's password doesn't lock the others out. */
export function signInThrottle(username: string) {
  const key = username.trim().toLowerCase();
  let t = throttles.get(key);
  if (!t) throttles.set(key, (t = createSignInThrottle()));
  return t;
}

export async function currentAccess(db: Db): Promise<Access | null> {
  return verifySession(db, (await cookies()).get(SESSION_COOKIE)?.value);
}

/** Every data read goes through here (via requestSession). Sends signed-out visitors to the sign-in page. */
export async function requireAccess(db: Db): Promise<Access> {
  return (await currentAccess(db)) ?? redirect("/login");
}

/**
 * Marks the cookie Secure when the browser reached GPA over HTTPS. Over plain HTTP (localhost, or an iPhone on the
 * home network) a Secure cookie would never be sent back, so it stays off there.
 */
async function overHttps(): Promise<boolean> {
  const h = await headers();
  return (h.get("x-forwarded-proto") ?? "").split(",")[0]!.trim() === "https" || (h.get("origin") ?? "").startsWith("https://");
}

export async function startSession(db: Db, user: Pick<UserRow, "id" | "sessionVersion">): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await issueSession(db, user), {
    httpOnly: true,
    sameSite: "lax",
    secure: await overHttps(),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Only same-site paths, so the ?next= parameter can't send someone to another website. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : "/";
}
