"use client";

import { useState, useTransition } from "react";
import { LockKeyhole, ShoppingBasket } from "lucide-react";
import { setUpPasscode, signIn } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "../ui";

export function LoginScreen({ mode, next }: { mode: "sign-in" | "set-up"; next: string }) {
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setUp = mode === "set-up";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // On success the action redirects; it only returns when something is wrong.
      const result = setUp ? await setUpPasscode(passcode, confirm) : await signIn(passcode, next);
      if (result && !result.ok) {
        setError(result.error);
        if (!setUp) setPasscode("");
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
            <h1 className="text-xl font-semibold tracking-tight">{setUp ? "Set a passcode for GPA" : "Welcome back"}</h1>
            <p className="mt-1 text-sm text-muted">
              {setUp
                ? "Anyone who can open this address needs it to see or change your accounts. Share it only with your household."
                : "Enter your household passcode."}
            </p>
          </div>
        </div>

        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label={setUp ? "New passcode" : "Passcode"} hint={setUp ? "At least 6 characters. Longer is safer if GPA is reachable from the internet." : undefined}>
              <Input
                type="password"
                name="passcode"
                autoComplete={setUp ? "new-password" : "current-password"}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoFocus
                required
              />
            </Field>
            {setUp && (
              <Field label="Repeat passcode">
                <Input type="password" name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </Field>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending || !passcode}>
              <LockKeyhole size={16} /> {setUp ? "Set passcode and open GPA" : "Sign in"}
            </Button>
          </form>
        </Card>
        {!setUp && <p className="mt-4 text-center text-xs text-muted">Forgot it? See “Reset the passcode” in the README.</p>}
      </div>
    </main>
  );
}
