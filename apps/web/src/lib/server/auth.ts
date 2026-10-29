import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSignInThrottle, issueSession, SESSION_MAX_AGE_S, verifySession, type Db } from "@gpa/db";
import { SESSION_COOKIE } from "../session-cookie";

const g = globalThis as { __gpaThrottle?: ReturnType<typeof createSignInThrottle> };
/** One throttle per server process: GPA is a single-household app, so this guards the one passcode. */
export const signInThrottle = (g.__gpaThrottle ??= createSignInThrottle());

export async function isSignedIn(db: Db): Promise<boolean> {
  return verifySession(db, (await cookies()).get(SESSION_COOKIE)?.value);
}

/** Every data read goes through here (via requestDb). Sends signed-out visitors to the sign-in page. */
export async function requireSession(db: Db): Promise<void> {
  if (!(await isSignedIn(db))) redirect("/login");
}

/**
 * Marks the cookie Secure when the browser reached GPA over HTTPS. Over plain HTTP (localhost, or an iPhone on the
 * home network) a Secure cookie would never be sent back, so it stays off there.
 */
async function overHttps(): Promise<boolean> {
  const h = await headers();
  return (h.get("x-forwarded-proto") ?? "").split(",")[0]!.trim() === "https" || (h.get("origin") ?? "").startsWith("https://");
}

export async function startSession(db: Db): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await issueSession(db), {
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
