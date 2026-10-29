import type { Metadata } from "next";
import { SecuritySettings } from "@/components/screens/settings";

export const metadata: Metadata = { title: "My account" };

export default function Page() {
  return <SecuritySettings />;
}
