import { useState } from 'react';
import { Show } from '@clerk/react';
import { useSignIn } from '@clerk/react/legacy';
import { Link, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegister } from '@workspace/api-client-react';

export default function Signup() {
  return (
    <AuthLayout>
      <Show when="signed-out">
        <SignupForm />
      </Show>
      <Show when="signed-in">
        <div className="text-sm text-muted-foreground font-mono">Redirecting to console…</div>
      </Show>
    </AuthLayout>
  );
}

function SignupForm() {
  const [, setLocation] = useLocation();
  const { isLoaded, signIn, setActive } = useSignIn();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pending = register.isPending || !isLoaded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || pending) return;
    setError(null);

    try {
      // #region agent log
      fetch('http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0657f2'},body:JSON.stringify({sessionId:'0657f2',hypothesisId:'D',location:'signup.tsx:submit',message:'Client posting register',data:{url:'/api/auth/register',href:typeof window!=='undefined'?window.location.href:''},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
      // #endregion
      const result = await register.mutateAsync({ data: { email, password } });
      const attempt = await signIn.create({
        strategy: 'ticket',
        ticket: result.ticket,
      });
      if (attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        setLocation('/chat');
        return;
      }
      setError('Account created, but sign-in could not be completed. Try logging in.');
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? (err as { status?: number }).status : undefined;
      const url = err && typeof err === 'object' && 'url' in err ? String((err as { url?: string }).url ?? '') : '';
      const raw = err instanceof Error ? err.message : String(err);
      // #region agent log
      fetch('http://127.0.0.1:7743/ingest/fbcc6644-f5ef-42d5-8361-4b0eb31d88ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0657f2'},body:JSON.stringify({sessionId:'0657f2',hypothesisId:'B',location:'signup.tsx:catch',message:'Register client error',data:{status,url,messagePreview:raw.slice(0,180),isHtml:raw.includes('<!DOCTYPE html>')||raw.includes('Cannot POST')},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
      // #endregion
      setError(err instanceof Error ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'Could not create your account.');
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center md:text-left">
        <h1 className="text-2xl font-medium tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Register with email and password. No verification code required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-email" className="text-xs">Email</Label>
          <Input
            id="signup-email"
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
          <Label htmlFor="signup-password" className="text-xs">Password</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={15}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 bg-background"
            placeholder="At least 15 characters"
          />
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full h-10" disabled={pending}>
          {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Create account
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}
