import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { SignInForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth";
import { startDemo } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          <p>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-brand hover:underline">
              Create one
            </Link>
          </p>
          <form action={startDemo} className="mt-3">
            <button type="submit" className="btn btn-ghost text-xs">
              or explore the demo without signing up →
            </button>
          </form>
        </>
      }
    >
      <SignInForm />
    </AuthShell>
  );
}
