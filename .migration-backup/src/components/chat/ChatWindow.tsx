import { useEffect, useRef, useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Bot,
  User,
  Brain,
  Database,
  Zap,
  CheckCircle,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import type { Message, OrchestratorStage } from '@/lib/types';

interface ChatWindowProps {
  messages: Message[];
  stages: OrchestratorStage[];
  isProcessing: boolean;
  onFeedback: (
    messageId: string,
    rating: 'positive' | 'negative',
    comment?: string
  ) => void;
}

const stageIcons: Record<number, React.ElementType> = {
  1: Brain,
  2: Database,
  3: Zap,
  4: CheckCircle,
};

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StageIndicator({
  stages,
  isProcessing,
}: {
  stages: OrchestratorStage[];
  isProcessing: boolean;
}) {
  if (stages.length === 0 && !isProcessing) return null;

  const allDone = stages.length > 0 && stages.every(s => s.status === 'completed');

  return (
    <div className="flex-shrink-0 border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-sky-50/30 px-6 py-3">
      <div className="flex items-center gap-2">
        {allDone && (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mr-1">
            Complete
          </span>
        )}
        {stages.map((stage, idx) => {
          const Icon = stageIcons[stage.stage] || CheckCircle;
          const isLast = idx === stages.length - 1;

          let statusColor = 'text-slate-300';
          let bgColor = 'bg-slate-50';
          let ringColor = '';

          if (stage.status === 'completed') {
            statusColor = 'text-emerald-600';
            bgColor = 'bg-emerald-50';
          } else if (stage.status === 'running') {
            statusColor = 'text-sky-600';
            bgColor = 'bg-sky-50';
            ringColor = 'ring-2 ring-sky-200';
          } else if (stage.status === 'error') {
            statusColor = 'text-red-500';
            bgColor = 'bg-red-50';
          }

          return (
            <div key={stage.stage} className="flex items-center">
              <div className="flex flex-col items-center gap-1 min-w-[72px]">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${bgColor} ${ringColor}`}
                >
                  {stage.status === 'running' ? (
                    <Loader2 className={`w-4 h-4 ${statusColor} animate-spin`} />
                  ) : (
                    <Icon className={`w-4 h-4 ${statusColor}`} />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium leading-tight text-center transition-colors ${
                    stage.status === 'pending'
                      ? 'text-slate-300'
                      : stage.status === 'completed'
                      ? 'text-emerald-600'
                      : 'text-slate-600'
                  }`}
                >
                  {stage.name}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`w-6 h-0.5 -mt-4 rounded-full transition-colors duration-300 ${
                    stage.status === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackButtons({
  messageId,
  onFeedback,
}: {
  messageId: string;
  onFeedback: ChatWindowProps['onFeedback'];
}) {
  const [selected, setSelected] = useState<'positive' | 'negative' | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  const handleFeedback = (rating: 'positive' | 'negative') => {
    if (selected) return;
    setSelected(rating);
    if (rating === 'negative') {
      setShowComment(true);
    } else {
      onFeedback(messageId, rating);
    }
  };

  const submitNegative = () => {
    onFeedback(messageId, 'negative', comment || undefined);
    setShowComment(false);
  };

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleFeedback('positive')}
          className={`p-1.5 rounded-lg transition-all duration-150 ${
            selected === 'positive'
              ? 'text-emerald-600 bg-emerald-50'
              : selected !== null
              ? 'text-slate-200 cursor-default'
              : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'
          }`}
          title="Helpful"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleFeedback('negative')}
          className={`p-1.5 rounded-lg transition-all duration-150 ${
            selected === 'negative'
              ? 'text-red-500 bg-red-50'
              : selected !== null
              ? 'text-slate-200 cursor-default'
              : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
          }`}
          title="Not helpful"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {showComment && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went wrong?"
            className="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 bg-white"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNegative();
            }}
            autoFocus
          />
          <button
            onClick={submitNegative}
            className="p-1.5 text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors duration-150"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-6 py-3">
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce-dot" />
          <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce-dot-2" />
          <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce-dot-3" />
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({
  messages,
  stages,
  isProcessing,
  onFeedback,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-sky-500/30">
              <Sparkles className="w-9 h-9 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-3 border-white" style={{ borderWidth: '3px' }} />
          </div>
          <p className="text-lg font-semibold text-slate-900 mb-1">
            AI Support Assistant
          </p>
          <p className="text-sm text-slate-400 max-w-xs text-center leading-relaxed">
            Ask me anything. I'll classify your request, retrieve relevant data, and provide a helpful response.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
            {['How do I reset my password?', 'What is the status of my order?', 'I found a bug in the dashboard'].map((s) => (
              <span key={s} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200/80 rounded-full">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <StageIndicator stages={stages} isProcessing={isProcessing} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {messages.map((message) => {
          const isUser = message.sender === 'user';

          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                  isUser
                    ? 'bg-slate-800'
                    : 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/20'
                }`}
              >
                {isUser ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>

              <div className={`max-w-[75%] ${isUser ? 'text-right' : 'text-left'}`}>
                <div
                  className={`inline-block px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-slate-800 text-white rounded-2xl rounded-tr-md shadow-md'
                      : 'bg-white border border-slate-200/80 text-slate-800 rounded-2xl rounded-tl-md shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {formatTime(message.created_at)}
                  </span>
                </div>
                {!isUser && (
                  <FeedbackButtons messageId={message.id} onFeedback={onFeedback} />
                )}
              </div>
            </div>
          );
        })}

        {isProcessing && <TypingIndicator />}
      </div>
    </div>
  );
}
