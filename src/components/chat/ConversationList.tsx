import { useState } from 'react';
import { Plus, MessageSquare, Search, Inbox } from 'lucide-react';
import type { Conversation, ConversationStatus } from '@/lib/types';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  onSelect: (c: Conversation) => void;
  onNew: () => void;
}

const statusConfig: Record<
  ConversationStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  active: { label: 'Active', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending_clarification: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  escalated: { label: 'Escalated', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  resolved: { label: 'Resolved', bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  closed: { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: ConversationStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1 h-1 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function getPreview(conversation: Conversation): string {
  const preview =
    (conversation.metadata?.first_message as string) ||
    `Conversation ${conversation.id.slice(0, 8)}`;
  return preview.length > 50 ? preview.slice(0, 50) + '…' : preview;
}

export default function ConversationList({
  conversations,
  activeConversation,
  onSelect,
  onNew,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = conversations.filter((c) => {
    if (!searchQuery) return true;
    const preview = getPreview(c).toLowerCase();
    return preview.includes(searchQuery.toLowerCase());
  });

  const activeCount = conversations.filter(c => c.status === 'active').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 border-b border-slate-200/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
            {activeCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                {activeCount}
              </span>
            )}
          </div>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg hover:shadow-lg hover:shadow-sky-500/25 active:scale-95 transition-all duration-200"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-transparent placeholder:text-slate-400 transition-all duration-150"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 p-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400 font-medium">
              {searchQuery ? 'No matches found' : 'No conversations yet'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-slate-300 mt-1">Click "New" to start</p>
            )}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filtered.map((conversation) => {
              const isActive = activeConversation?.id === conversation.id;
              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelect(conversation)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-50 to-blue-50/50 ring-1 ring-sky-200/60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p
                      className={`text-sm leading-snug line-clamp-1 ${
                        isActive
                          ? 'font-semibold text-slate-900'
                          : 'font-medium text-slate-600 group-hover:text-slate-800'
                      }`}
                    >
                      {getPreview(conversation)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={conversation.status} />
                    <span className="text-[10px] text-slate-400 font-medium">
                      {formatRelativeTime(conversation.last_activity_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-2.5 border-t border-slate-200/80 bg-slate-50/50">
        <p className="text-[11px] text-slate-400 font-medium">
          {conversations.length} total conversation{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
