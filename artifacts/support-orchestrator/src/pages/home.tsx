import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Network, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <span className="font-mono font-medium tracking-tight">SYS_ORCHESTRATOR</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost" className="font-mono text-xs">LOGIN</Button>
          </Link>
          <Link href="/chat">
            <Button className="font-mono text-xs shadow-none">LAUNCH_CONSOLE</Button>
          </Link>
        </nav>
      </header>
      
      <main className="flex-1 flex flex-col">
        <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-background/80 z-10 backdrop-blur-[1px]"></div>
            <div className="w-full h-full opacity-20" style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
          </div>
          
          <div className="relative z-20 max-w-3xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-medium border border-primary/20 mb-4">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              V0.1.0_BETA ONLINE
            </div>
            <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-foreground balance">
              Customer Support AI <br/><span className="text-muted-foreground">Orchestrator</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A high-density mission control for AI-driven conversations. Manage intents, configure orchestration rules, and monitor resolution workflows in real-time.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/chat">
                <Button size="lg" className="font-mono tracking-wide px-8 h-12 w-full sm:w-auto shadow-none">
                  ACCESS_SYSTEM <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/widget" target="_blank">
                <Button variant="outline" size="lg" className="font-mono tracking-wide px-8 h-12 w-full sm:w-auto border-border bg-card">
                  PREVIEW_WIDGET
                </Button>
              </Link>
            </div>
          </div>
        </section>
        
        <section className="border-t border-border bg-card py-16 px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3 p-6 rounded-lg border border-border bg-background">
              <Activity className="w-6 h-6 text-primary" />
              <h3 className="font-medium text-base">Real-time Telemetry</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Watch the orchestrator classify intents, assign confidence scores, and resolve support queries as they happen.</p>
            </div>
            <div className="space-y-3 p-6 rounded-lg border border-border bg-background">
              <Zap className="w-6 h-6 text-primary" />
              <h3 className="font-medium text-base">Rule Engine</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Define precise escalation triggers and required clarification prompts based on fine-grained intent categories.</p>
            </div>
            <div className="space-y-3 p-6 rounded-lg border border-border bg-background">
              <ShieldCheck className="w-6 h-6 text-primary" />
              <h3 className="font-medium text-base">Knowledge Integration</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Connect arbitrary API endpoints and knowledge sources to give your agents verified, authoritative context.</p>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="h-14 border-t border-border flex items-center justify-between px-6 bg-card text-xs text-muted-foreground font-mono">
        <div>SYS_ORCHESTRATOR_CLIENT</div>
        <div>ALL_SYSTEMS_NOMINAL</div>
      </footer>
    </div>
  );
}
