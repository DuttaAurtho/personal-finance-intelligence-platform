"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signUp, type FormState } from "@/app/actions/auth";
import { CURRENCIES } from "@/lib/money";

const INITIAL: FormState = {};

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary h-11 w-full" disabled={pending}>
      {pending ? "Just a moment…" : children}
    </button>
  );
}

function ErrorNote({ state }: { state: FormState }) {
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-negative/40 bg-negative-soft px-3 py-2 text-sm text-negative"
    >
      {state.error}
    </p>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <ErrorNote state={state} />

      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@example.com"
          aria-invalid={state.field === "email"}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
          aria-invalid={state.field === "password"}
        />
      </div>

      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <ErrorNote state={state} />

      <div>
        <label className="label" htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          className="input"
          placeholder="Alex"
        />
      </div>

      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@example.com"
          aria-invalid={state.field === "email"}
        />
        <p className="mt-1 text-xs text-subtle">
          Used only to sign you in. It stays in your local database.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          placeholder="At least 8 characters"
          aria-invalid={state.field === "password"}
        />
      </div>

      <div>
        <label className="label" htmlFor="currency">Currency</label>
        <select id="currency" name="currency" className="input" defaultValue="GBP">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5">
        <input
          type="checkbox"
          name="seed"
          defaultChecked
          className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
        />
        <span className="text-sm text-muted">
          <span className="font-medium text-fg">Load sample data</span> — two years of realistic
          transactions so there is something to look at straight away. You can wipe it any time from
          Settings.
        </span>
      </label>

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
