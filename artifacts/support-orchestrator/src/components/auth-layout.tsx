import { Network } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col md:flex-row">
      <div className="hidden md:flex flex-1 bg-sidebar text-sidebar-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-primary/15 text-sidebar-primary">
            <Network className="w-5 h-5" />
          </span>
          <div className="font-semibold text-xl tracking-tight">Orchestrator</div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight mb-4 leading-tight">Your AI support team, always in sync</h1>
          <p className="text-sidebar-foreground/60 leading-relaxed">
            Monitor conversations, review grounded answers, and step in whenever it matters — all from one connected workspace.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-1.5 text-xs text-sidebar-foreground/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Secure connection
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background gap-6">
        {children}
      </div>
    </div>
  );
}
