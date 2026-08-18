import { SignIn, SignUp, Show } from '@clerk/react';
import { useState } from 'react';
import { Network } from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Login() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  return (
    <div className="min-h-screen w-full bg-background flex flex-col md:flex-row">
      {/* Left panel */}
      <div className="hidden md:flex flex-1 bg-sidebar text-sidebar-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <Network className="w-8 h-8 text-sidebar-primary" />
          <div className="font-mono text-xl tracking-tight">SYS_ORCHESTRATOR</div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-light tracking-tight mb-4">Command Center for AI Operations</h1>
          <p className="text-sidebar-foreground/60 leading-relaxed">
            Monitor, intervene, and configure intent models in real-time. Secure authentication
            required for operational clearance.
          </p>
        </div>
        <div className="relative z-10 font-mono text-[10px] text-sidebar-foreground/30">
          SECURE CONNECTION ESTABLISHED / ENCRYPTED
        </div>
      </div>

      {/* Right panel — Clerk components */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background gap-6">
        <Show when="signed-out">
          {mode === 'sign-in' ? (
            <SignIn
              routing="path"
              path={`${basePath}/login`}
              signUpUrl={`${basePath}/login`}
              fallbackRedirectUrl={`${basePath}/chat`}
            />
          ) : (
            <SignUp
              routing="path"
              path={`${basePath}/login`}
              signInUrl={`${basePath}/login`}
              fallbackRedirectUrl={`${basePath}/chat`}
            />
          )}
          <button
            type="button"
            onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors font-mono"
          >
            {mode === 'sign-in' ? 'REQUIRE_NEW_ACCOUNT?' : 'EXISTING_OPERATOR?'}
          </button>
        </Show>
        <Show when="signed-in">
          <div className="text-sm text-muted-foreground font-mono">Redirecting to console…</div>
        </Show>
      </div>
    </div>
  );
}
