import Link from "next/link";

import { isSupabaseConfigured } from "@/lib/env";
import { DemoAuthNotice } from "@/components/auth/demo-auth-notice";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Canvas" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  if (!isSupabaseConfigured) {
    return <DemoAuthNotice />;
  }

  const { redirect: redirectTo } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Sign in to your canvas</p>
      </div>
      <LoginForm redirectTo={redirectTo ?? "/"} />
      <p className="text-muted-foreground text-center text-sm">
        No account?{" "}
        <Link
          className="text-foreground font-medium underline-offset-4 hover:underline"
          href="/signup"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
