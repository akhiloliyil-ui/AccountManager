import type { Metadata } from "next";
import { CategoriesSettings } from "@/components/screens/settings";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return <CategoriesSettings />;
}
