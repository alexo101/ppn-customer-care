import { Link, Redirect } from 'wouter';
import { useAuth } from '@clerk/react';
import { Button } from '@/components/ui/button';
import { Network, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/agents" />;

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 md:px-8 bg-card">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary">
            <Network className="w-4 h-4" />
          </span>
          <span className="font-semibold tracking-tight">Orchestrator</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link href="/agents">
            <Button>Go to agents</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-background/90 z-10 backdrop-blur-[1px]"></div>
            <div className="w-full h-full opacity-10" style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
          </div>

          <div className="relative z-20 max-w-3xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              Early access
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground leading-tight">
              Customer support AI, <br className="hidden sm:block" /><span className="text-primary">orchestrated end to end</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Design the conversations your AI agents have with customers. Publish knowledge once, and let the assistant answer from it.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link href="/agents">
                <Button size="lg" className="px-8 w-full sm:w-auto">
                  Get started <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
              <Link href="/widget" target="_blank">
                <Button variant="outline" size="lg" className="px-8 w-full sm:w-auto bg-card">
                  Preview widget
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-card py-16 px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <div className="space-y-3 p-6 rounded-xl border border-border bg-background">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                <Activity className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-base">Real-time visibility</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Watch answers, escalations, and article usage as conversations happen.
              </p>
            </div>
            <div className="space-y-3 p-6 rounded-xl border border-border bg-background">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                <Zap className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-base">Grounded answers</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The assistant answers from published articles and says when the knowledge base is not enough.
              </p>
            </div>
            <div className="space-y-3 p-6 rounded-xl border border-border bg-background">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-base">Trusted knowledge</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Write articles once and assign them to a target so the assistant can answer with that knowledge.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="h-14 border-t border-border flex items-center justify-between px-6 md:px-8 bg-card text-xs text-muted-foreground">
        <div>© {new Date().getFullYear()} Orchestrator</div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          All systems operational
        </div>
      </footer>
    </div>
  );
}
