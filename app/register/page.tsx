import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { SignUpForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/app");

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        process.env.TURSO_DATABASE_URL
          ? "Your data is kept in its own database, isolated from every other account."
          : "Everything is stored locally. This is just how the app keeps your data separate."
      }
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
