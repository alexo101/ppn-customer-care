import { useState } from 'react';
import { useConversations } from '@/hooks/useConversations';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import MessageInput from '@/components/chat/MessageInput';
import DebugPanel from '@/components/chat/DebugPanel';
import { Settings2, AlertCircle, X, SlidersHorizontal } from 'lucide-react';

export function ChatPage() {
  const {
    conversations,
    activeConversation,
    messages,
    logs,
    stages,
    isProcessing,
    error,
    createConversation,
    selectConversation,
    sendMessage,
    updateStatus,
    submitFeedback,
    setError,
  } = useConversations();

  const [debugOpen, setDebugOpen] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextRole, setContextRole] = useState('agent');
  const [contextUrl, setContextUrl] = useState('https://app.example.com/dashboard');

  const handleNew = async () => {
    await createConversation({
      user_role: contextRole,
      current_url: contextUrl,
    });
  };

  const handleSend = async (content: string) => {
    if (!activeConversation) {
      const conv = await createConversation({
        user_role: contextRole,
        current_url: contextUrl,
      });
      if (!conv) return;
    }
    await sendMessage(content);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
      <div className="w-80 flex-shrink-0 border-r border-slate-200/80 bg-white/60 backdrop-blur-sm">
        <ConversationList
          conversations={conversations}
          activeConversation={activeConversation}
          onSelect={selectConversation}
          onNew={handleNew}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/80 bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-900 text-sm">
              {activeConversation ? 'Conversation' : 'Select or start a conversation'}
            </h2>
            {activeConversation && (
              <StatusBadge status={activeConversation.status} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeConversation && activeConversation.status !== 'closed' && activeConversation.status !== 'resolved' && (
              <div className="flex items-center gap-1.5 bg-slate-100/80 rounded-lg p-1">
                <button
                  onClick={() => updateStatus('escalated')}
                  className="px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded-md transition-all"
                >
                  Escalate
                </button>
                <div className="w-px h-4 bg-slate-200" />
                <button
                  onClick={() => updateStatus('resolved')}
                  className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md transition-all"
                >
                  Resolve
                </button>
                <div className="w-px h-4 bg-slate-200" />
                <button
                  onClick={() => updateStatus('closed')}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-all"
                >
                  Close
                </button>
              </div>
            )}
            <button
              onClick={() => setShowContext(!showContext)}
              className={`p-2 rounded-lg transition-all ${showContext ? 'bg-sky-100 text-sky-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
              title="Context settings"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showContext && (
          <div className="px-6 py-3 bg-gradient-to-r from-sky-50/80 to-blue-50/50 border-b border-sky-100/80 flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Settings2 className="w-3.5 h-3.5 text-sky-500" />
              <span className="font-medium text-xs uppercase tracking-wider">Context</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-xs font-medium text-slate-500">Role</span>
              <select
                value={contextRole}
                onChange={(e) => setContextRole(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="agent">Agent</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 flex-1">
              <span className="text-xs font-medium text-slate-500">URL</span>
              <input
                type="text"
                value={contextUrl}
                onChange={(e) => setContextUrl(e.target.value)}
                className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="hover:bg-red-100 rounded p-0.5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ChatWindow
            messages={messages}
            stages={stages}
            isProcessing={isProcessing}
            onFeedback={submitFeedback}
          />
        </div>

        <div className="border-t border-slate-200/80 bg-white/60 backdrop-blur-sm">
          <MessageInput
            onSend={handleSend}
            disabled={isProcessing || (!!activeConversation && (activeConversation.status === 'closed' || activeConversation.status === 'resolved'))}
          />
        </div>
      </div>

      <DebugPanel
        logs={logs}
        stages={stages}
        isOpen={debugOpen}
        onToggle={() => setDebugOpen(!debugOpen)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string; dot: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active', dot: 'bg-emerald-500' },
    pending_clarification: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending', dot: 'bg-amber-500' },
    escalated: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Escalated', dot: 'bg-blue-500' },
    resolved: { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Resolved', dot: 'bg-teal-500' },
    closed: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Closed', dot: 'bg-slate-400' },
  };
  const c = config[status] ?? config.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
