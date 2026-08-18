import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  Conversation,
  OrchestratorLog,
  ConversationFeedback,
} from '@/lib/types';
import {
  BarChart3,
  TrendingUp,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: typeof BarChart3;
  color: string;
  subtitle?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    sky: {
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      icon: 'text-sky-500',
    },
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      icon: 'text-emerald-500',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      icon: 'text-amber-500',
    },
    slate: {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      icon: 'text-slate-500',
    },
  };

  const c = colorMap[color] ?? colorMap.slate;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div
          className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center`}
        >
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Horizontal Bar Chart (div-based)                                   */
/* ------------------------------------------------------------------ */
function HorizontalBarChart({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2.5">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-32 truncate text-right shrink-0">
            {item.label}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
              style={{
                width: `${Math.max((item.count / max) * 100, 4)}%`,
              }}
            >
              <span className="text-[10px] font-semibold text-white">
                {item.count}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    resolved: 'bg-sky-50 text-sky-700 border-sky-200',
    closed: 'bg-gray-100 text-gray-600 border-gray-200',
    escalated: 'bg-amber-50 text-amber-700 border-amber-200',
    pending_clarification: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
        styles[status] ?? styles.closed
      }`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Feedback Ring                                                      */
/* ------------------------------------------------------------------ */
function FeedbackRing({
  positive,
  negative,
}: {
  positive: number;
  negative: number;
}) {
  const total = positive + negative;
  const pct = total > 0 ? Math.round((positive / total) * 100) : 0;
  // We'll use a simple CSS ring via conic-gradient
  const gradient =
    total > 0
      ? `conic-gradient(#10b981 0% ${pct}%, #ef4444 ${pct}% 100%)`
      : 'conic-gradient(#e5e7eb 0% 100%)';

  return (
    <div className="flex items-center gap-6">
      {/* Ring */}
      <div className="relative">
        <div
          className="h-28 w-28 rounded-full"
          style={{ background: gradient }}
        />
        <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center">
          <span className="text-xl font-bold text-gray-900">
            {total > 0 ? `${pct}%` : '—'}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ThumbsUp className="h-4 w-4 text-emerald-500" />
          <span className="text-sm text-gray-700">
            <span className="font-semibold">{positive}</span> positive
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThumbsDown className="h-4 w-4 text-red-500" />
          <span className="text-sm text-gray-700">
            <span className="font-semibold">{negative}</span> negative
          </span>
        </div>
        <p className="text-xs text-gray-400">{total} total reviews</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Types for aggregated data                                          */
/* ------------------------------------------------------------------ */
interface ConversationWithMessages extends Conversation {
  message_count?: number;
  first_message?: string;
}

interface CategoryCount {
  label: string;
  count: number;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function AnalyticsDashboard() {
  const [conversations, setConversations] = useState<
    ConversationWithMessages[]
  >([]);
  const [logs, setLogs] = useState<OrchestratorLog[]>([]);
  const [feedback, setFeedback] = useState<ConversationFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* -------- fetch -------- */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [convRes, logsRes, fbRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('orchestrator_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('conversation_feedback').select('*'),
    ]);

    if (convRes.error) {
      setError(convRes.error.message);
    } else {
      setConversations(convRes.data ?? []);
    }

    setLogs(logsRes.data ?? []);
    setFeedback(fbRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* -------- derived stats -------- */
  const totalConversations = conversations.length;
  const activeConversations = conversations.filter(
    (c) => c.status === 'active'
  ).length;
  const resolvedConversations = conversations.filter(
    (c) => c.status === 'resolved' || c.status === 'closed'
  ).length;

  // Avg messages per conversation: count logs per conversation as a proxy
  const conversationLogCounts: Record<string, number> = {};
  for (const log of logs) {
    conversationLogCounts[log.conversation_id] =
      (conversationLogCounts[log.conversation_id] ?? 0) + 1;
  }
  const logCountValues = Object.values(conversationLogCounts);
  const avgMessages =
    logCountValues.length > 0
      ? (
          logCountValues.reduce((a, b) => a + b, 0) / logCountValues.length
        ).toFixed(1)
      : '0';

  // Category distribution
  const categoryCounts: Record<string, number> = {};
  for (const log of logs) {
    if (log.detected_category) {
      categoryCounts[log.detected_category] =
        (categoryCounts[log.detected_category] ?? 0) + 1;
    }
  }
  const categoryData: CategoryCount[] = Object.entries(categoryCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Feedback
  const positiveFeedback = feedback.filter((f) => f.rating === 'positive').length;
  const negativeFeedback = feedback.filter((f) => f.rating === 'negative').length;

  // Recent conversations with first log info
  const recentConversations = conversations.slice(0, 10).map((conv) => {
    const convLogs = logs.filter((l) => l.conversation_id === conv.id);
    const firstLog = convLogs[convLogs.length - 1]; // oldest
    return {
      ...conv,
      detected_category: firstLog?.detected_category ?? '—',
      confidence: firstLog?.confidence_score ?? 0,
      first_message: firstLog?.prompt_assembled?.slice(0, 80) ?? '—',
    };
  });

  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            Dashboard
          </h2>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Conversations"
            value={totalConversations}
            icon={MessageSquare}
            color="sky"
          />
          <StatCard
            label="Active"
            value={activeConversations}
            icon={TrendingUp}
            color="emerald"
          />
          <StatCard
            label="Resolved"
            value={resolvedConversations}
            icon={BarChart3}
            color="slate"
          />
          <StatCard
            label="Avg Messages"
            value={avgMessages}
            icon={MessageSquare}
            color="amber"
            subtitle="per conversation"
          />
        </div>

        {/* Middle row: Category distribution + Feedback */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category Distribution */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Category Distribution
            </h3>
            {categoryData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No category data yet
              </p>
            ) : (
              <HorizontalBarChart data={categoryData} />
            )}
          </div>

          {/* Feedback Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Feedback Summary
            </h3>
            {feedback.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No feedback yet
              </p>
            ) : (
              <FeedbackRing
                positive={positiveFeedback}
                negative={negativeFeedback}
              />
            )}
          </div>
        </div>

        {/* Recent Conversations */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">
              Recent Conversations
            </h3>
          </div>

          {recentConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Preview
                    </th>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentConversations.map((conv) => (
                    <tr
                      key={conv.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="text-xs text-gray-700 truncate max-w-xs">
                          {conv.first_message}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-medium text-gray-600">
                          {conv.detected_category}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-full rounded-full transition-all ${
                                conv.confidence >= 0.8
                                  ? 'bg-emerald-500'
                                  : conv.confidence >= 0.5
                                  ? 'bg-amber-500'
                                  : 'bg-red-400'
                              }`}
                              style={{
                                width: `${Math.round(conv.confidence * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 tabular-nums">
                            {Math.round(conv.confidence * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={conv.status} />
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-gray-400">
                          {new Date(conv.created_at).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
