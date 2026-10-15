import { Show, useAuth, useClerk } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { useGetInvitation, useRedeemInvitation, getGetInvitationQueryKey } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { buildInviteUrl } from "@/lib/invite-url";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const redeemInFlight = new Set<string>();

function apiErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, "") : fallback;
}

export default function Invite() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  return (
    <AuthLayout>
      {token ? <InviteContent token={token} /> : <InvalidInvite />}
    </AuthLayout>
  );
}

function InviteContent({ token }: { token: string }) {
  const { isLoaded } = useAuth();
  const invitation = useGetInvitation(token, {
    query: {
      queryKey: getGetInvitationQueryKey(token),
      enabled: token.length > 0,
      retry: false,
    },
  });
  const status = invitation.data?.status;

  if (!isLoaded || invitation.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking your invite…</p>
      </div>
    );
  }

  if (invitation.isError || !status || status === "invalid") {
    return (
      <UnavailableInvite
        title="This invite link is not valid"
        description="Ask a teammate to send a new invitation link."
      />
    );
  }

  if (status === "expired") {
    return (
      <UnavailableInvite
        title="This invite link has expired"
        description="Ask a teammate to copy a new invitation link from Team."
      />
    );
  }

  if (status === "redeemed") {
    return (
      <UnavailableInvite
        title="This invite has already been used"
        description="Sign in with the Google account that joined, or ask for a new link."
      />
    );
  }

  return (
    <>
      <Show when="signed-in">
        <RedeemInvite token={token} />
      </Show>
      <Show when="signed-out">
        <InviteSignIn token={token} />
      </Show>
    </>
  );
}

function RedeemInvite({ token }: { token: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { mutateAsync: redeem } = useRedeemInvitation();
  const redeemRef = useRef(redeem);
  redeemRef.current = redeem;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || redeemInFlight.has(token)) return;
    redeemInFlight.add(token);
    setError(null);
    void redeemRef
      .current({ data: { token } })
      .then(() => {
        setLocation("/agents");
      })
      .catch((err: unknown) => {
        redeemInFlight.delete(token);
        setError(apiErrorMessage(err, "Could not join the workspace."));
      });
  }, [isLoaded, isSignedIn, setLocation, token]);

  if (error) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center md:text-left">
          <h1 className="text-2xl font-medium tracking-tight">Could not join</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the Google account that was invited, then open this link again.
          </p>
        </div>
        <p className="text-xs text-destructive">{error}</p>
        <Button
          type="button"
          className="h-10 w-full"
          onClick={() => {
            void signOut().then(() => {
              setError(null);
            });
          }}
        >
          Sign out and try another account
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Joining the workspace…</p>
    </div>
  );
}

function InviteSignIn({ token }: { token: string }) {
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const completeUrl = buildInviteUrl(token, window.location.origin, import.meta.env.BASE_URL);

  const handleGoogle = async () => {
    if (!signIn || !isLoaded || pending) return;
    setError(null);
    setPending(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}${basePath}/sso-callback`,
        redirectUrlComplete: completeUrl,
        oidcPrompt: "select_account",
      });
    } catch (err) {
      setPending(false);
      setError(apiErrorMessage(err, "Could not start Google sign-in."));
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-medium tracking-tight">Join the workspace</h1>
        <p className="text-sm text-muted-foreground">
          Continue with the @papernest.com Google account that was invited.
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

function UnavailableInvite({ title, description }: { title: string; description: string }) {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild className="h-10 w-full">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </div>
  );
}

function InvalidInvite() {
  return (
    <UnavailableInvite
      title="This invite link is not valid"
      description="Ask a teammate to send a new invitation link."
    />
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
