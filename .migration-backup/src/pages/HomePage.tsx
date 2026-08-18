import {
  Bot, MessageSquare, Brain, Database, Zap, CheckCircle,
  Layers, GitBranch, Plug, BarChart3, Code, ArrowRight, Cpu,
  Sparkles, TrendingUp, ShieldCheck, Copy, Check,
} from 'lucide-react';
import { useState } from 'react';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

const stages = [
  { icon: Brain, title: 'Intent Classification', description: 'Analyzes the user message, classifies it against your configurable category catalog, and determines the best handling rule.', color: 'from-sky-500 to-blue-600' },
  { icon: Database, title: 'Data Retrieval', description: 'Fetches relevant documentation, queries connected APIs, and retrieves conversation context to build a complete picture.', color: 'from-cyan-500 to-teal-600' },
  { icon: Zap, title: 'Response Generation', description: 'Assembles the final prompt with all retrieved context and generates an accurate, context-aware response.', color: 'from-amber-500 to-orange-600' },
  { icon: CheckCircle, title: 'Request Closing', description: 'Tracks resolution status, collects user feedback, and manages the conversation lifecycle until closure.', color: 'from-emerald-500 to-green-600' },
];

const features = [
  { icon: Layers, title: 'Configurable Categories', description: 'Add, edit, or remove intent categories and subcategories without any code changes. The system adapts instantly.' },
  { icon: GitBranch, title: 'Flexible Rules Engine', description: 'Define orchestration rules, link them to categories, and control which data sources each rule uses.' },
  { icon: Cpu, title: 'LLM-Agnostic', description: 'Swap between AI providers (OpenAI, Anthropic, etc.) through configuration. No vendor lock-in.' },
  { icon: Plug, title: 'Pluggable Sources', description: 'Connect knowledge bases (Notion, Confluence) and APIs (Salesforce, billing) as data sources for your rules.' },
  { icon: BarChart3, title: 'Real-Time Analytics', description: 'Track every interaction: categories detected, confidence scores, resolution times, and user feedback.' },
  { icon: Code, title: 'Embeddable Widget', description: 'Drop a single code snippet into any website to add an AI support chat. Works anywhere.' },
];

export function HomePage({ onNavigate }: HomePageProps) {
  const [copied, setCopied] = useState(false);

  const embedSnippet = `<script>
  (function() {
    var w = document.createElement('div');
    w.id = 'ai-support-widget';
    document.body.appendChild(w);
    var s = document.createElement('script');
    s.src = window.location.origin + '/widget.js';
    s.async = true;
    document.body.appendChild(s);
  })();
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(56,189,248,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(14,165,233,0.12) 0%, transparent 50%)' }} />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-medium text-sky-300">Full Lifecycle Orchestrator Engine</span>
            </div>

            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Customer Support
              <br />
              <span className="bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
                AI Orchestrator
              </span>
            </h1>

            <p className="text-lg text-slate-300 mb-8 max-w-2xl leading-relaxed">
              A complete support engine that classifies user intent, retrieves the right data,
              generates accurate responses, and manages every conversation from first message to resolution.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate('admin')}
                className="group flex items-center gap-2 px-6 py-3.5 bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-xl shadow-sky-500/25 hover:shadow-sky-500/40 hover:-translate-y-0.5"
              >
                <MessageSquare className="w-5 h-5" />
                Configure your Customer Care Agent
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-50 rounded-full mb-4">
              <Zap className="w-3.5 h-3.5" />
              How It Works
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Four stages, one seamless flow
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
              Every support request passes through four orchestrated stages,
              each configurable and fully transparent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stages.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <div key={stage.title} className="relative group">
                  <div className="bg-white rounded-2xl p-6 border border-slate-200/80 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 h-full">
                    <div className="flex items-center justify-between mb-5">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stage.color} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-3xl font-bold text-slate-100">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-2 text-base">{stage.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{stage.description}</p>
                  </div>
                  {i < stages.length - 1 && (
                    <div className="hidden lg:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                      <div className="w-6 h-6 bg-white rounded-full border border-slate-200 flex items-center justify-center shadow-sm">
                        <ArrowRight className="w-3 h-3 text-slate-300" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full mb-4">
              <TrendingUp className="w-3.5 h-3.5" />
              Built for Scale
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Everything is configurable
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
              No code changes needed to adapt the system. Manage everything through the admin panel.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group bg-white rounded-2xl p-6 border border-slate-200/80 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100/50 transition-all duration-300"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:from-sky-50 group-hover:to-blue-50 group-hover:text-sky-600 transition-all duration-300">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Embed Snippet */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(56,189,248,0.2) 0%, transparent 50%)' }} />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-sky-300 bg-sky-500/10 rounded-full mb-4">
                <Code className="w-3.5 h-3.5" />
                Embed Anywhere
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight">
                Drop it into any website
              </h2>
              <p className="text-slate-300 mb-8 leading-relaxed text-base">
                Add the AI support widget to any website with a single code snippet.
                It loads a compact chat interface in the bottom corner of the page --
                no build step, no dependencies.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onNavigate('widget')}
                  className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-xl shadow-sky-500/25"
                >
                  <MessageSquare className="w-4 h-4" />
                  Preview Widget
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <div className="flex items-center gap-4 mt-8 pt-8 border-t border-white/10">
                <div className="flex items-center gap-2 text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">No dependencies</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">Lightweight</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  </div>
                  <span className="text-xs font-medium text-slate-400 ml-2">embed.html</span>
                </div>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all duration-200 ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="text-sm text-sky-300 overflow-x-auto leading-relaxed font-mono">
                <code>{embedSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-white border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-slate-500">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium">AI Support Orchestrator</span>
          </div>
          <p className="text-sm text-slate-400">Full-lifecycle customer support engine</p>
        </div>
      </footer>
    </div>
  );
}
