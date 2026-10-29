/**
 * Runs once when the server starts. Hosts such as Vercel reserve the TZ variable, so the household time zone can
 * also be given as GPA_TIMEZONE (e.g. Asia/Dubai). It decides what "today", this week and this month are.
 */
export function register() {
  const zone = process.env.GPA_TIMEZONE;
  if (zone && process.env.NEXT_RUNTIME === "nodejs") process.env.TZ = zone;
}
