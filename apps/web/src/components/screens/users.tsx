"use client";

import { useState } from "react";
import { KeyRound, LogOut, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { addUserAction, removeUserAction, resetPasswordAction, signOutUserAction, updateUserAction } from "@/app/actions/auth";
import type { AccountView, UserRole, UserView } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { BackLink, Badge, Button, Card, Field, IconButton, Input, PageHeader, Segmented, Sheet, Switch } from "../ui";
import { ROLE_LABELS } from "./settings";

const ROLE_HELP: Record<UserRole, string> = {
  read: "Sees the chosen accounts, their transactions and reports. Can't change anything.",
  write: "Also adds, edits and deletes transactions on the chosen accounts, imports statements into them, and uses grocery lists.",
  admin: "Everything, on every account: people, accounts, categories, currencies and settings.",
};

export function UsersSettings({ users, accounts, maxUsers, me }: { users: UserView[]; accounts: AccountView[]; maxUsers: number; me: string }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState<UserView | "new" | null>(null);
  const [resetting, setResetting] = useState<UserView | null>(null);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const full = users.length >= maxUsers;

  return (
    <div className="space-y-4">
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="People & access"
        subtitle={`${users.length} of ${maxUsers} people. Each signs in with their own username and password.`}
        action={
          <Button onClick={() => setEditing("new")} disabled={full}>
            <Plus size={18} /> <span className="hidden sm:inline">Add person</span>
          </Button>
        }
      />
      {full && <p className="text-sm text-muted">GPA allows {maxUsers} people: the owner and {maxUsers - 1} more. Remove someone to add another.</p>}

      <Card className="divide-y divide-border">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
              <UserRound size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {u.displayName}
                <span className="text-sm font-normal text-muted">@{u.username}</span>
                <Badge tone={u.role === "admin" ? "primary" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                {u.isOwner && <Badge>Owner</Badge>}
                {u.id === me && <Badge>You</Badge>}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {u.allAccounts ? "All accounts" : u.accountIds.map((id) => accountName.get(id) ?? "Removed account").join(", ")}
              </p>
            </div>
            {!u.isOwner && u.id !== me && (
              <div className="flex items-center">
                <IconButton label={`Edit ${u.displayName}`} onClick={() => setEditing(u)}>
                  <Pencil size={16} />
                </IconButton>
                <IconButton label={`Set a new password for ${u.displayName}`} onClick={() => setResetting(u)}>
                  <KeyRound size={16} />
                </IconButton>
                <IconButton
                  label={`Sign ${u.displayName} out`}
                  disabled={pending}
                  onClick={() => run(() => signOutUserAction(u.id), { success: `${u.displayName} is signed out on every device` })}
                >
                  <LogOut size={16} />
                </IconButton>
                <IconButton
                  label={`Remove ${u.displayName}`}
                  disabled={pending}
                  onClick={() => confirm(`Remove ${u.displayName}? They won't be able to sign in. Their transactions stay.`) && run(() => removeUserAction(u.id), { success: `${u.displayName} removed` })}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card className="space-y-2 p-4 text-sm text-muted">
        {(["read", "write", "admin"] as const).map((r) => (
          <p key={r}>
            <b className="text-text">{ROLE_LABELS[r]}:</b> {ROLE_HELP[r]}
          </p>
        ))}
        <p>Totals, net worth, stats and exports only add up the accounts a person can see. Grocery lists, prices and offers are shared by everyone.</p>
      </Card>

      {editing && <PersonSheet person={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordSheet person={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function PersonSheet({ person, accounts, onClose }: { person: UserView | null; accounts: AccountView[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(person?.displayName ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(person?.role ?? "read");
  const [allAccounts, setAllAccounts] = useState(person?.allAccounts ?? false);
  const [chosen, setChosen] = useState<Set<string>>(new Set(person?.accountIds ?? []));
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const accountIds = [...chosen];
    if (person) {
      run(() => updateUserAction(person.id, { displayName, role, allAccounts, accountIds }), {
        success: `${displayName || person.displayName} updated. Any change to their access applies when they next sign in.`,
        onDone: onClose,
      });
    } else {
      run(() => addUserAction({ username, displayName, password, role, allAccounts, accountIds }), {
        success: `${displayName || username} added. Share their username and password with them.`,
        onDone: onClose,
      });
    }
  };

  return (
    <Sheet open onClose={onClose} title={person ? `Edit ${person.displayName}` : "Add a person"} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {!person && (
            <Field label="Username" hint="Used to sign in, e.g. priya">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} autoComplete="off" required autoFocus />
            </Field>
          )}
          <Field label="Name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Priya" />
          </Field>
          {!person && (
            <Field label="Password" hint="At least 8 characters. They can change it in My account.">
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
            </Field>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Access</p>
          <Segmented
            label="Access"
            value={role}
            onChange={(v) => setRole(v as UserRole)}
            options={[
              { value: "read", label: "Read" },
              { value: "write", label: "Write" },
              { value: "admin", label: "Admin" },
            ]}
          />
          <p className="mt-1.5 text-sm text-muted">{ROLE_HELP[role]}</p>
        </div>

        {role !== "admin" && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted">Accounts</p>
              <label className="flex items-center gap-2 text-sm">
                All accounts, including new ones
                <Switch checked={allAccounts} onChange={setAllAccounts} label="All accounts" />
              </label>
            </div>
            {!allAccounts && (
              <Card className="max-h-64 divide-y divide-border overflow-y-auto">
                {accounts.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={chosen.has(a.id)} onChange={() => toggle(a.id)} className="size-4 accent-[var(--primary)]" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="text-xs text-muted">
                      {a.groupName} · {a.currency}
                    </span>
                  </label>
                ))}
              </Card>
            )}
          </div>
        )}

        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {person ? "Save changes" : "Add person"}
        </Button>
      </form>
    </Sheet>
  );
}

function ResetPasswordSheet({ person, onClose }: { person: UserView; onClose: () => void }) {
  const { pending, run } = useAction();
  const [password, setPassword] = useState("");
  return (
    <Sheet open onClose={onClose} title={`New password for ${person.displayName}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => resetPasswordAction(person.id, password), { success: `Password set. ${person.displayName} is signed out until they use it.`, onDone: onClose });
        }}
      >
        <Field label="New password" hint="At least 8 characters. Tell them, and ask them to change it in My account.">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} autoFocus />
        </Field>
        <Button type="submit" disabled={pending}>
          Set password
        </Button>
      </form>
    </Sheet>
  );
}
