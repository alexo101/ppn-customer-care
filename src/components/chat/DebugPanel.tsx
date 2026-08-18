import { useState } from 'react';
import {
  Bug,
  Brain,
  Database,
  Zap,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Terminal,
  Cpu,
  Tag,
  Route,
} from 'lucide-react';
import type { OrchestratorLog, OrchestratorStage } from '@/lib/types';

interface DebugPanelProps {
  logs: OrchestratorLog[];
  stages: OrchestratorStage[];
  isOpen: boolean;
  onToggle: () => void;
}

const stageIcons: Record<number, React.ElementType> = {
  1: Brain,
  2: Database,
  3: Zap,
  4: CheckCircle,
};

function ConfidenceBar({ confidence, label }: { confidence: number; label: string }) {
  let barColor = 'bg-red-400';
  if (confidence >= 0.8) barColor = 'bg-emerald-500';
  else if (confidence >= 0.6) barColor = 'bg-amber-400';
  else if (confidence >= 0.4) barColor = 'bg-orange-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</span>
        <span className="text-xs font-mono font-bold text-slate-700">
          {(confidence * 100).toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${confidence * 100}%` }}
        />
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors duration-150"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
        <Icon className="w-3.5 h-3.5 text-slate-500" />
        {title}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

function StageTimeline({ stages }: { stages: OrchestratorStage[] }) {
  if (stages.length === 0) return null;

  return (
    <CollapsibleSection title="Pipeline Stages" icon={Zap}>
      <div className="space-y-2">
        {stages.map((stage) => {
          const Icon = stageIcons[stage.stage] || CheckCircle;

          let statusColor = 'text-slate-400';
          let statusBg = 'bg-slate-50';
          let statusLabel = 'Pending';

          if (stage.status === 'completed') {
            statusColor = 'text-emerald-600';
            statusBg = 'bg-emerald-50';
            statusLabel = 'Done';
          } else if (stage.status === 'running') {
            statusColor = 'text-sky-600';
            statusBg = 'bg-sky-50';
            statusLabel = 'Running';
          } else if (stage.status === 'error') {
            statusColor = 'text-red-500';
            statusBg = 'bg-red-50';
            statusLabel = 'Error';
          }

          return (
            <div
              key={stage.stage}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${statusBg} transition-colors duration-200`}
            >
              {stage.status === 'running' ? (
                <Loader2 className={`w-4 h-4 ${statusColor} animate-spin flex-shrink-0`} />
              ) : (
                <Icon className={`w-4 h-4 ${statusColor} flex-shrink-0`} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">
                  {stage.name}
                </p>
              </div>
              <span className={`text-[10px] font-bold ${statusColor}`}>
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

function LogDetail({ log }: { log: OrchestratorLog }) {
  return (
    <div className="space-y-3">
      <CollapsibleSection title="Classification" icon={Brain}>
        <div className="space-y-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Category
            </span>
            <div className="mt-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-semibold text-slate-800 bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg">
                <Tag className="w-3 h-3 text-sky-500" />
                {log.detected_category}
              </span>
            </div>
          </div>
          <ConfidenceBar confidence={log.confidence_score} label="Confidence" />
          {log.secondary_categories.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Secondary
              </span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {log.secondary_categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded-full"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {Object.keys(log.detected_entities).length > 0 && (
        <CollapsibleSection title="Entities Detected" icon={Zap}>
          <div className="space-y-1.5">
            {Object.entries(log.detected_entities).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">{key}</span>
                <span className="text-slate-700 font-mono text-[11px] bg-slate-50 px-2 py-0.5 rounded-md">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Routing" icon={Route}>
        <div className="space-y-2.5">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Rule Selected
            </span>
            <p className="text-xs font-medium text-slate-700 mt-1 bg-slate-50 px-2.5 py-1.5 rounded-lg">
              {log.rule_used}
            </p>
          </div>
          {log.data_sources_queried.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Data Sources Queried
              </span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {log.data_sources_queried.map((source) => (
                  <span
                    key={source}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-sky-50 text-sky-700 rounded-full"
                  >
                    <Database className="w-2.5 h-2.5" />
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {log.prompt_assembled && (
        <CollapsibleSection title="Assembled Prompt" icon={Terminal} defaultOpen={false}>
          <pre className="text-[11px] font-mono text-slate-600 bg-slate-900 text-slate-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
            {log.prompt_assembled}
          </pre>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Metrics" icon={Clock}>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-2.5 text-center border border-slate-200/60">
            <Cpu className="w-3 h-3 text-slate-400 mx-auto mb-1" />
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Tokens
            </p>
            <p className="text-sm font-bold text-slate-800 mt-0.5 font-mono">
              {log.tokens_used.toLocaleString()}
            </p>
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-2.5 text-center border border-slate-200/60">
            <Clock className="w-3 h-3 text-slate-400 mx-auto mb-1" />
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Latency
            </p>
            <p className="text-sm font-bold text-slate-800 mt-0.5 font-mono">
              {log.latency_ms}ms
            </p>
          </div>
          <div className="col-span-2 bg-gradient-to-br from-sky-50/50 to-blue-50/30 rounded-xl p-2.5 text-center border border-sky-100/60">
            <p className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">
              Model
            </p>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">
              {log.llm_model}
            </p>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default function DebugPanel({
  logs,
  stages,
  isOpen,
  onToggle,
}: DebugPanelProps) {
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <>
      <button
        onClick={onToggle}
        className={`fixed top-4 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 shadow-lg ${
          isOpen
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800'
        }`}
        title={isOpen ? 'Close debug panel' : 'Open debug panel'}
      >
        <Bug className={`w-4 h-4 ${isOpen ? 'text-sky-400' : ''}`} />
        <span className="text-xs font-semibold hidden lg:inline">Debug</span>
      </button>

      <div
        className={`h-full bg-white/80 backdrop-blur-xl border-l border-slate-200/80 transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'w-80' : 'w-0'
        }`}
      >
        <div className="w-80 h-full flex flex-col">
          <div className="flex-shrink-0 px-4 py-3.5 border-b border-slate-200/80 bg-gradient-to-r from-slate-50/80 to-sky-50/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
                <Bug className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 leading-none">
                  Debug Panel
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Orchestrator internal state
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <StageTimeline stages={stages} />

            {latestLog ? (
              <LogDetail log={latestLog} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                  <Bug className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-xs text-center text-slate-400 font-medium">
                  No debug data yet.
                  <br />
                  Send a message to see orchestrator logs.
                </p>
              </div>
            )}

            {logs.length > 1 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] text-slate-400 text-center font-medium">
                  Showing latest of {logs.length} log entries
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
