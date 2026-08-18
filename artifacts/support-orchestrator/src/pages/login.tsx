import { SignIn, Show } from '@clerk/react';
import { useAuth } from '@clerk/react';
import { Redirect } from 'wouter';
import { AuthLayout } from '@/components/auth-layout';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function SignedInRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/chat" />;
  return null;
}

export default function Login() {
  return (
    <AuthLayout>
      <SignedInRedirect />
      <Show when="signed-out">
        <SignIn
          routing="path"
          path={`${basePath}/login`}
          signUpUrl={`${basePath}/signup`}
          fallbackRedirectUrl={`${basePath}/chat`}
        />
      </Show>
    </AuthLayout>
  );
}
