import { Show, useAuth } from '@clerk/react';
import { useSignIn } from '@clerk/react/legacy';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link, Redirect, useLocation } from 'wouter';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

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
  const [, setLocation] = useLocation();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = !isLoaded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || pending) return;
    setError(null);

    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        setLocation('/dashboard');
        return;
      }
      setError('Sign-in needs another step. Please try again or use account recovery.');
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'Could not sign in.');
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-medium tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your support workspace.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email" className="text-xs">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 bg-background"
            placeholder="you@company.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password" className="text-xs">Password</Label>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-background pr-10"
              placeholder="Your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href={`${basePath}/signup`} className="text-foreground underline underline-offset-4 hover:text-primary">
          Create one
        </Link>
      </p>
    </div>
  );
}
