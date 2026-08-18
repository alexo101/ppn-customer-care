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

      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background gap-6">
        {children}
      </div>
    </div>
  );
}
