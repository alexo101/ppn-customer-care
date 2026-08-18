import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Conversation, Message, OrchestratorLog } from '@/lib/types';
import {
  MessageSquare,
  Search,
  ChevronRight,
  X,
  Clock,
  TrendingUp,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active', dot: 'bg-emerald-500' },
  pending_clarification: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending', dot: 'bg-amber-500' },
  escalated: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Escalated', dot: 'bg-blue-500' },
  resolved: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Resolved', dot: 'bg-teal-500' },
  closed: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Closed', dot: 'bg-slate-400' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function StatPill({ icon: Icon, label, value, color }: { icon: typeof MessageSquare; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-xl px-4 py-3">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{label}</p>
      </div>
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function ConversationsPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<OrchestratorLog[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('conversations')
      .select('*')
      .order('last_activity_at', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setConversations(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      setLogs([]);
      return;
    }
    const load = async () => {
      setMessagesLoading(true);
      const [msgRes, logRes] = await Promise.all([
        supabase.from('messages').select('*').eq('conversation_id', selected.id).order('created_at'),
        supabase.from('orchestrator_logs').select('*').eq('conversation_id', selected.id).order('created_at'),
      ]);
      setMessages(msgRes.data ?? []);
      setLogs(logRes.data ?? []);
      setMessagesLoading(false);
    };
    load();
  }, [selected]);

  const total = conversations.length;
  const active = conversations.filter((c) => c.status === 'active').length;
  const resolved = conversations.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
  const escalated = conversations.filter((c) => c.status === 'escalated').length;

  const filtered = conversations.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* Main list */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatPill icon={MessageSquare} label="Total" value={total} color="bg-sky-500" />
          <StatPill icon={TrendingUp} label="Active" value={active} color="bg-emerald-500" />
          <StatPill icon={AlertCircle} label="Escalated" value={escalated} color="bg-amber-500" />
          <StatPill icon={CheckCircle} label="Resolved" value={resolved} color="bg-teal-500" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100 transition-all"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100 transition-all"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending_clarification">Pending</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
              Loading conversations...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <MessageSquare className="w-10 h-10 mb-3 text-slate-300" />
              <p className="text-sm">No conversations found</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Conversation</th>
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Last Activity</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((conv) => {
                    const isSelected = selected?.id === conv.id;
                    return (
                      <tr
                        key={conv.id}
                        onClick={() => setSelected(conv)}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-50/60' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-medium text-slate-700 truncate max-w-[220px]">
                            {conv.id.slice(0, 8)}...
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={conv.status} />
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs text-slate-400">{formatDate(conv.created_at)}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs text-slate-400">{formatDate(conv.last_activity_at)}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <ChevronRight className={`w-4 h-4 transition-colors ${isSelected ? 'text-sky-500' : 'text-slate-300'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <aside className="w-[380px] flex-shrink-0 bg-white border border-slate-200/80 rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80">
            <div className="flex items-center gap-3">
              <StatusBadge status={selected.status} />
              <span className="text-xs text-slate-400">{formatDate(selected.created_at)}</span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messagesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Clock className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <MessageSquare className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm">No messages in this conversation</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-sky-500 text-white rounded-br-md'
                        : 'bg-slate-100 text-slate-700 rounded-bl-md'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1.5 ${msg.sender === 'user' ? 'text-sky-100' : 'text-slate-400'}`}>
                      {formatDate(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {logs.length > 0 && (
            <div className="border-t border-slate-200/80 px-5 py-3 max-h-48 overflow-y-auto">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Orchestrator Logs</p>
              <div className="space-y-1.5">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">{log.detected_category}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400 tabular-nums">{Math.round(log.confidence_score * 100)}% confidence</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
