import { Suspense } from "react";
import { AppData } from "@/components/app-data";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui";

/** Everything behind the passcode: the shell, plus the household data every screen shares. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton />}>
        <AppData>{children}</AppData>
      </Suspense>
    </AppShell>
  );
}
