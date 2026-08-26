import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { AuthLayout } from "@/components/auth-layout";

export default function SSOCallback() {
  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Finishing Google sign-in…</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </AuthLayout>
  );
}
