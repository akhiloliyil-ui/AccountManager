import type { Metadata } from "next";
import { SettingsHub } from "@/components/screens/settings";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsHub />;
}
