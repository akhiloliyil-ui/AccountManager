import { weekStartOf, todayIso } from "@gpa/core";
import { listLists, type Db } from "@gpa/db";

/** This week's list id, if one exists (pages never create lists just by being viewed). */
export async function currentWeekListId(db: Db): Promise<string | null> {
  const week = weekStartOf(todayIso());
  return (await listLists(db)).find((l) => l.type === "weekly" && l.periodStart === week)?.id ?? null;
}
