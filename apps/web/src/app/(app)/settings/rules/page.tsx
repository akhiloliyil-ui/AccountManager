import type { Metadata } from "next";
import { listRules } from "@gpa/db";
import { RulesSettings } from "@/components/screens/settings";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Rules" };

export default async function Page() {
  const db = await requestDb();
  return <RulesSettings rules={await listRules(db)} />;
}
