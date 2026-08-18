import { SignIn, Show } from '@clerk/react';
import { AuthLayout } from '@/components/auth-layout';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Login() {
  return (
    <AuthLayout>
      <Show when="signed-out">
        <SignIn
          routing="path"
          path={`${basePath}/login`}
          signUpUrl={`${basePath}/signup`}
          fallbackRedirectUrl={`${basePath}/chat`}
        />
      </Show>
      <Show when="signed-in">
        <div className="text-sm text-muted-foreground font-mono">Redirecting to console…</div>
      </Show>
    </AuthLayout>
  );
}
