import type { Metadata } from "next";
import { listAccounts, listUsers, MAX_USERS } from "@gpa/db";
import { UsersSettings } from "@/components/screens/users";
import { requestAdmin } from "@/lib/server/db";

export const metadata: Metadata = { title: "People & access" };

export default async function Page() {
  const { db, access } = await requestAdmin();
  const [users, accounts] = await Promise.all([listUsers(db), listAccounts(db, { includeArchived: true })]);
  return <UsersSettings users={users} accounts={accounts} maxUsers={MAX_USERS} me={access.userId} />;
}
