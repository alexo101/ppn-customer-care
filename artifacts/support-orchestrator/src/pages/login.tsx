import { Show, useAuth } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function SignedInRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return null;
}

export default function Login() {
  return (
    <AuthLayout>
      <SignedInRedirect />
      <Show when="signed-out">
        <LoginForm />
      </Show>
    </AuthLayout>
  );
}

function LoginForm() {
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "forbidden") {
      return "This workspace is only for invited papernest.com Google accounts.";
    }
    return null;
  });
  const [pending, setPending] = useState(false);

  const handleGoogle = async () => {
    if (!signIn || !isLoaded || pending) return;
    setError(null);
    setPending(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}${basePath}/sso-callback`,
        redirectUrlComplete: `${window.location.origin}${basePath}/dashboard`,
        oidcPrompt: "select_account",
      });
    } catch (err) {
      setPending(false);
      setError(
        err instanceof Error
          ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, "")
          : "Could not start Google sign-in.",
      );
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-medium tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your @papernest.com Google account. You must be invited to this workspace.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        type="button"
        className="h-10 w-full"
        disabled={!isLoaded || pending}
        onClick={() => void handleGoogle()}
      >
        {pending || !isLoaded ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <GoogleMark />
        )}
        Continue with Google
      </Button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.18v2.96h5.27c-.23 1.5-1.78 4.4-5.27 4.4-3.18 0-5.78-2.63-5.78-5.86s2.6-5.86 5.78-5.86c1.81 0 3.03.77 3.73 1.43l2.54-2.45C16.54 4.36 14.46 3.4 12.17 3.4 7.5 3.4 3.7 7.2 3.7 11.9s3.8 8.5 8.47 8.5c4.89 0 8.13-3.44 8.13-8.28 0-.56-.06-1.02-.15-1.02z"
      />
    </svg>
  );
}
