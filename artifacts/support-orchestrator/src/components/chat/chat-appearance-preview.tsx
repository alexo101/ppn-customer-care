import { Bot, Send } from "lucide-react";
import { contrastHex, DEFAULT_BACKGROUND_COLOR, DEFAULT_CHAT_NAME, DEFAULT_CTA_COLOR } from "@/lib/appearance-theme";
import { agentLanguageCopy, normalizeAgentLanguage, type AgentLanguage } from "@/lib/agent-language";

type ChatAppearancePreviewProps = {
  name?: string;
  ctaColor?: string;
  backgroundColor?: string;
  logoUrl?: string | null;
  communicationLanguage?: AgentLanguage;
  className?: string;
};

export function ChatAppearancePreview({
  name,
  ctaColor = DEFAULT_CTA_COLOR,
  backgroundColor = DEFAULT_BACKGROUND_COLOR,
  logoUrl,
  communicationLanguage = "en",
  className,
}: ChatAppearancePreviewProps) {
  const onCta = contrastHex(ctaColor);
  const onBackground = contrastHex(backgroundColor);
  const language = normalizeAgentLanguage(communicationLanguage);

  return (
    <div
      className={className}
      style={{ backgroundColor, color: onBackground }}
    >
      <div
        className="h-14 px-4 flex items-center gap-2.5 shrink-0"
        style={{ backgroundColor: ctaColor, color: onCta }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Chat logo" className="h-8 w-8 rounded-md object-contain bg-white/90 p-0.5" />
        ) : (
          <div className="h-8 w-8 rounded-md flex items-center justify-center bg-black/10">
            <Bot className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-tight">
              {name?.trim() || DEFAULT_CHAT_NAME}
            </div>
          </div>
          <div className="text-[10px] opacity-80">{agentLanguageCopy(language, "previewDescription")}</div>
        </div>
      </div>

      <div className="p-4 space-y-3 min-h-[280px]">
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm bg-white text-slate-800 shadow-sm border border-black/5">
            {agentLanguageCopy(language, "previewWelcome")}
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm"
            style={{ backgroundColor: ctaColor, color: onCta }}
          >
            {agentLanguageCopy(language, "previewCustomer")}
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm bg-white text-slate-800 shadow-sm border border-black/5">
            {agentLanguageCopy(language, "previewReply")}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-black/10 bg-white/70">
        <div className="relative">
          <div className="h-10 rounded-full bg-white border border-black/10 px-4 pr-12 text-sm text-slate-400 flex items-center">
            {agentLanguageCopy(language, "messagePlaceholder")}
          </div>
          <div
            className="absolute right-1 top-1 h-8 w-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: ctaColor, color: onCta }}
          >
            <Send className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
