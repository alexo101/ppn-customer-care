import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { processMessage } from '@/lib/orchestrator';
import type { Message } from '@/lib/types';
import { Bot, Send, X, Minimize2, ThumbsUp, ThumbsDown, Loader2, Sparkles, ArrowUp } from 'lucide-react';

export function WidgetPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const content = input.trim();
    setInput('');
    setIsProcessing(true);

    try {
      let convId = conversationId;
      if (!convId) {
        const { data: conv, error: convErr } = await supabase
          .from('conversations')
          .insert({ metadata: { source: 'widget' } })
          .select()
          .maybeSingle();
        if (convErr || !conv) throw new Error('Failed to start conversation');
        convId = conv.id;
        setConversationId(convId);
      }

      const { data: userMsg, error: msgErr } = await supabase
        .from('messages')
        .insert({ conversation_id: convId, sender: 'user', content })
        .select()
        .maybeSingle();
      if (msgErr || !userMsg) throw new Error('Failed to send message');

      setMessages((prev) => [...prev, userMsg]);

      await supabase
        .from('conversations')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', convId);

      const currentMessages = [...messages, userMsg];
      const result = await processMessage(convId!, content, currentMessages);

      const { data: asstMsg, error: asstErr } = await supabase
        .from('messages')
        .insert({ conversation_id: convId, sender: 'assistant', content: result.response })
        .select()
        .maybeSingle();
      if (asstErr || !asstMsg) throw new Error('Failed to save response');

      setMessages((prev) => [...prev, asstMsg]);

      const logEntry = { ...result.log, message_id: asstMsg.id };
      await supabase.from('orchestrator_logs').insert(logEntry);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          conversation_id: conversationId ?? '',
          sender: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFeedback = async (messageId: string, rating: 'positive' | 'negative') => {
    if (!conversationId) return;
    await supabase.from('conversation_feedback').insert({
      conversation_id: conversationId,
      message_id: messageId,
      rating,
    });
  };

  if (!isOpen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-sky-50 flex items-center justify-center p-8">
        <div className="max-w-2xl text-center">
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-sky-500/30">
              <Sparkles className="w-9 h-9 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Widget Preview</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            This is what the embedded chat widget looks like on any website.
            Click the button below to open it.
          </p>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 group flex items-center gap-2 pl-4 pr-5 h-14 bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-2xl shadow-2xl shadow-sky-500/30 transition-all duration-300 hover:scale-105 active:scale-95"
        >
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <span className="font-semibold text-sm">Chat with AI</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-sky-50 flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="relative inline-block mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-sky-500/30">
            <Sparkles className="w-9 h-9 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Widget Preview</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          This is what the embedded chat widget looks like on any website.
          The widget is open below -- try sending a message.
        </p>
      </div>

      <div className="fixed bottom-6 right-6 w-96 h-[34rem] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden z-50 animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Bot className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">AI Support</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-[11px] text-slate-400">Online now</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                setMessages([]);
                setConversationId(null);
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50/50 to-white">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-sky-500/20">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <p className="text-sm font-semibold text-slate-900">How can I help?</p>
              <p className="text-xs text-slate-400 mt-1">Ask me anything about our services</p>
              <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
                {['How do I...', 'Check status', 'Report a bug'].map((s) => (
                  <span key={s} className="px-2.5 py-1 text-[11px] font-medium text-slate-500 bg-white border border-slate-200/80 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%]`}>
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-br-md shadow-md'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-md shadow-sm'
                  }`}
                >
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i} className={i > 0 ? 'mt-1.5' : ''}>{line}</p>
                  ))}
                </div>
                {msg.sender === 'assistant' && (
                  <div className="flex items-center gap-1 mt-1.5 ml-1">
                    <button
                      onClick={() => handleFeedback(msg.id, 'positive')}
                      className="p-1 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-md transition-colors"
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.id, 'negative')}
                      className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce-dot" />
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce-dot-2" />
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce-dot-3" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200/80 p-3 bg-white">
          <div className="flex items-end gap-2 bg-slate-50 rounded-2xl px-3 py-2 border border-slate-200/60 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message…"
              className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400"
              disabled={isProcessing}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${
                input.trim() && !isProcessing
                  ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/25 active:scale-90'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
