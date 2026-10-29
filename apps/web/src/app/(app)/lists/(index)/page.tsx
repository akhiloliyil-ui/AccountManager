import type { Metadata } from "next";
import { listLists } from "@gpa/db";
import { ListsScreen } from "@/components/screens/lists";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Lists" };

export default async function Page() {
  const db = await requestDb();
  return <ListsScreen lists={await listLists(db)} />;
}
