import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isPasscodeSet } from "@gpa/db";
import { LoginScreen } from "@/components/screens/login";
import { isSignedIn, safeNext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Sign in" };

async function Login({ searchParams }: PageProps<"/login">) {
  await connection();
  const db = await getDb();
  const next = safeNext([(await searchParams).next].flat()[0]);
  if (await isSignedIn(db)) redirect(next);
  return <LoginScreen mode={(await isPasscodeSet(db)) ? "sign-in" : "set-up"} next={next} />;
}

export default function Page(props: PageProps<"/login">) {
  return (
    <Suspense>
      <Login {...props} />
    </Suspense>
  );
}
