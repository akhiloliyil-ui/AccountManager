import type { Metadata } from "next";
import { CategoriesSettings } from "@/components/screens/settings";
import { requestAdmin } from "@/lib/server/db";

export const metadata: Metadata = { title: "Categories" };

export default async function Page() {
  await requestAdmin();
  return <CategoriesSettings />;
}
