import type { Metadata } from "next";
import { listAccounts } from "@gpa/db";
import { GrocerySettings } from "@/components/screens/settings";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Grocery settings" };

export default async function Page() {
  const db = await requestDb();
  return <GrocerySettings accounts={await listAccounts(db)} />;
}
