import { useState, useRef, useEffect } from 'react';
import { Send, ArrowUp } from 'lucide-react';

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="flex-shrink-0 px-6 py-4">
      <div
        className={`flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${
          disabled
            ? 'bg-slate-50/80 border border-slate-200/60'
            : 'bg-white border border-slate-200 shadow-sm focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Waiting for response…'
              : 'Type your message…'
          }
          rows={1}
          className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 bg-transparent resize-none focus:outline-none disabled:cursor-not-allowed leading-relaxed"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
            canSend
              ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white hover:shadow-lg hover:shadow-sky-500/25 active:scale-90'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-2 text-center font-medium">
        Press <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Enter</kbd> to send · <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
