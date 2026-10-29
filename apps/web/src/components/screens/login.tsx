"use client";

import { useState, useTransition } from "react";
import { LockKeyhole, ShoppingBasket } from "lucide-react";
import { setUpOwner, signIn } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "../ui";

export function LoginScreen({ mode, next }: { mode: "sign-in" | "set-up"; next: string }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setUp = mode === "set-up";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // On success the action redirects; it only returns when something is wrong.
      const result = setUp ? await setUpOwner({ username, displayName, password, confirm }) : await signIn(username, password, next);
      if (result && !result.ok) {
        setError(result.error);
        if (!setUp) setPassword("");
      }
    });
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-on-primary">
            <ShoppingBasket size={28} strokeWidth={2.25} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{setUp ? "Set up GPA" : "Welcome back"}</h1>
            <p className="mt-1 text-sm text-muted">
              {setUp
                ? "Create the owner account. You can add up to 4 more people afterwards, in Settings → People & access."
                : "Sign in with your username and password."}
            </p>
          </div>
        </div>

        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username" hint={setUp ? "Letters and numbers, e.g. akhil. Used to sign in." : undefined}>
              <Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </Field>
            {setUp && (
              <Field label="Your name">
                <Input name="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Akhil" />
              </Field>
            )}
            <Field label="Password" hint={setUp ? "At least 8 characters. Longer is safer if GPA is reachable from the internet." : undefined}>
              <Input
                type="password"
                name="password"
                autoComplete={setUp ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {setUp && (
              <Field label="Repeat password">
                <Input type="password" name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </Field>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending || !username || !password}>
              <LockKeyhole size={16} /> {setUp ? "Create owner and open GPA" : "Sign in"}
            </Button>
          </form>
        </Card>
        {!setUp && <p className="mt-4 text-center text-xs text-muted">Forgot your password? Ask an admin to set a new one in People & access.</p>}
      </div>
    </main>
  );
}
