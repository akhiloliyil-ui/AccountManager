import { redirect } from "next/navigation";
import { ensureCurrentWeekList } from "@gpa/db";
import { requestDb } from "@/lib/server/db";

/** Quick add: opens this week's list (creating it on the first visit of the week) with the search focused. */
export async function GET() {
  const db = await requestDb();
  const id = await ensureCurrentWeekList(db);
  redirect(`/lists/${id}?add=1`);
}
