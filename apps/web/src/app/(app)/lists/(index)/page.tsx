import type { Metadata } from "next";
import { listLists } from "@gpa/db";
import { ListsScreen } from "@/components/screens/lists";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Lists" };

export default async function Page() {
  const { db } = await requestSession();
  return <ListsScreen lists={await listLists(db)} />;
}
