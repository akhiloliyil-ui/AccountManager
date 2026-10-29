import type { Metadata } from "next";
import { listRules } from "@gpa/db";
import { RulesSettings } from "@/components/screens/settings";
import { requestAdmin } from "@/lib/server/db";

export const metadata: Metadata = { title: "Rules" };

export default async function Page() {
  const { db } = await requestAdmin();
  return <RulesSettings rules={await listRules(db)} />;
}
